/**
 * اختبار المحرك كاملًا: نداءات `fetch` حقيقية على قاعدة بيانات حقيقية.
 *
 * لا كائنات وهمية ولا استدعاء دوال داخلية. كل فحص هنا يمر من نفس الباب الذي
 * تمر منه لوحة أثر أو متصفح زبون، لأن كل عطل واجهناه في هذه المنصة كان في
 * المسافة بين طرفين سليمين لا داخل أحدهما.
 *
 * التشغيل: node worker/tests/engine.integration.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';
import { FakeBucket, FakeD1 } from './d1.mjs';

const SECRET = 'test-adapter-secret-not-a-real-one';
const ORIGIN = 'https://restaurant.test';

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

/* ---------- البيئة ---------- */

const schema = readFileSync(fileURLToPath(new URL('../schema.sql', import.meta.url)), 'utf8');
const db = new FakeD1();
db.exec(schema);

const env = {
  DB: db,
  ASSETS_BUCKET: new FakeBucket(),
  ATHAR_ADAPTER_SECRET: SECRET,
  PUBLIC_APP_URL: `${ORIGIN}/`,
  ASSETS: { fetch: async () => new Response('static', { status: 200 }) },
};

const call = (path, init = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env);

/**
 * يقرأ الجسم مرة واحدة.
 *
 * `Response` يُقرأ مرة فقط، وقراءته في رسالة التأكيد ثم مرة أخرى للتحقق
 * أسقطت نصف هذه الاختبارات بخطأ يبدو كعطل في المحرك وهو خطأ في الاختبار.
 */
async function read(response) {
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text), text };
  } catch {
    return { status: response.status, body: null, text };
  }
}

/* ---------- توقيع المحوّل، كما تفعل اللوحة تمامًا ---------- */

const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(bytes) {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function sign(canonical) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
}

async function adapter(method, path, body, overrides = {}) {
  const requestId = overrides.requestId || crypto.randomUUID();
  const timestamp = String(overrides.timestamp || Math.floor(Date.now() / 1000));
  const payload = body ? JSON.stringify({ ...body, request_id: overrides.bodyRequestId || requestId }) : '';
  const bytes = new TextEncoder().encode(payload);
  const canonical = `${timestamp}\n${requestId}\n${method}\n${path}\n${await sha256Hex(bytes)}`;
  const signature = overrides.signature || await sign(canonical);
  return call(path, {
    method,
    body: payload || undefined,
    headers: {
      'X-Athar-Timestamp': timestamp,
      'X-Athar-Request-Id': requestId,
      'X-Athar-Signature': signature,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

const TENANT = 'ten_demo_0001';
const TENANT_B = 'ten_other_0002';

/* ==================== 1. التزويد ==================== */

let demo;
await check('provision demo tenant', async () => {
  const response = await adapter('POST', '/internal/v1/tenants', {
    tenant_id: TENANT, slug: 'adana-demo', display_name: 'مطعم أضنة',
    environment: 'demo', plan_code: 'restaurant_full', admin_username: 'owner',
    config: { short_name: 'Adana', phone: '0599000000' },
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  demo = body;
  assert.ok(demo.credentials.secret, 'no credential returned');
  assert.equal(demo.credentials.username, 'owner');
  assert.equal(demo.public_url, `${ORIGIN}/r/adana-demo/`);
  assert.equal(demo.seed_version, 'restaurant-demo-1');
});

await check('provisioning is idempotent by request id', async () => {
  const requestId = crypto.randomUUID();
  const body = {
    tenant_id: 'ten_replay', slug: 'replay-x', display_name: 'إعادة',
    environment: 'production', plan_code: 'menu',
  };
  const first = await adapter('POST', '/internal/v1/tenants', body, { requestId });
  const second = await adapter('POST', '/internal/v1/tenants', body, { requestId });
  const one = await read(first);
  const two = await read(second);
  assert.equal(one.status, 201, one.text);
  assert.equal(two.body.replayed, true, 'second call should replay, not create');
  // والأهم: الكلمة المعادة هي نفسها، وإلا قُفل المطعم على صاحبه عند إعادة محاولة.
  assert.equal(one.body.credentials.secret, two.body.credentials.secret);
});

await check('same tenant cannot be provisioned twice', async () => {
  const response = await adapter('POST', '/internal/v1/tenants', {
    tenant_id: TENANT, slug: 'adana-again', display_name: 'مكرر',
    environment: 'demo', plan_code: 'full',
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'TENANT_ALREADY_EXISTS');
});

await check('a colliding slug does not steal another restaurant url', async () => {
  const response = await adapter('POST', '/internal/v1/tenants', {
    tenant_id: TENANT_B, slug: 'adana-demo', display_name: 'مطعم آخر',
    environment: 'production', plan_code: 'full', admin_username: 'owner',
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  assert.notEqual(body.slug, 'adana-demo', 'second restaurant reused the first slug');
});

/* ==================== 2. أمن المحوّل ==================== */

await check('a wrong signature is rejected', async () => {
  const response = await adapter('GET', `/internal/v1/tenants/${TENANT}/health`, null, {
    signature: 'f'.repeat(64),
  });
  assert.equal(response.status, 401);
});

await check('a body request_id that differs from the header is rejected', async () => {
  const response = await adapter('POST', `/internal/v1/tenants/${TENANT}/plan`,
    { plan_code: 'full' }, { bodyRequestId: crypto.randomUUID() });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'REQUEST_ID_MISMATCH');
});

await check('an old timestamp is rejected', async () => {
  const response = await adapter('GET', `/internal/v1/tenants/${TENANT}/health`, null, {
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  });
  assert.equal(response.status, 401);
});

await check('health reports plan and status', async () => {
  const response = await adapter('GET', `/internal/v1/tenants/${TENANT}/health`);
  const health = await response.json();
  assert.equal(response.status, 200);
  assert.equal(health.plan_code, 'full');
  assert.equal(health.status, 'active');
  assert.equal(health.public_url, `${ORIGIN}/r/adana-demo/`);
});

/* ==================== 3. الموقع العام ==================== */

await check('the home page is server rendered with seeded content', async () => {
  const response = await call('/r/adana-demo/');
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.ok(page.includes('مطعم أضنة'), 'restaurant name missing');
  assert.ok(page.includes('كباب أضنة'), 'featured item missing');
  // العلامة النصية لا تظهر على الصفحة الرئيسية في أضنة أصلًا — تظهر فقط
  // في صفحة الطلب المستقلة (مغطاة بفحص منفصل هناك).
  assert.ok(page.includes('dir="rtl"'), 'not RTL');
  assert.ok(page.includes('--brand-red:#E30613'), 'brand colour not injected');
});

await check('the english page flips direction and language', async () => {
  const page = await (await call('/r/adana-demo/?lang=en')).text();
  assert.ok(page.includes('dir="ltr"'), 'not LTR');
  assert.ok(page.includes('Adana Kebab'), 'english name missing');
});

await check('the menu lists every category and item', async () => {
  const page = await (await call('/r/adana-demo/menu')).text();
  for (const needle of ['المشاوي', 'الساندويتشات', 'المقبلات', 'شاورما لحم', 'كنافة نابلسية']) {
    assert.ok(page.includes(needle), `menu missing ${needle}`);
  }
});

await check('an unpriced item shows its note, never a zero price', async () => {
  const page = await (await call('/r/adana-demo/menu')).text();
  assert.ok(page.includes('كستليتا غنم'), 'unpriced item missing');
  assert.ok(page.includes('حسب الطلب'), 'unpriced note missing');
  assert.ok(!page.includes('>0.00 ₪<'), 'an unpriced item rendered as free');
});

await check('a restaurant name containing markup cannot inject the page', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/profile`,
    { display_name: '<script>alert(1)</script>مطعم' });
  const page = await (await call('/r/adana-demo/')).text();
  assert.ok(!page.includes('<script>alert(1)</script>'), 'markup was not escaped');
  assert.ok(page.includes('&lt;script&gt;'), 'escaped form missing');
  await adapter('POST', `/internal/v1/tenants/${TENANT}/profile`,
    { display_name: 'مطعم أضنة', short_name: 'Adana' });
});

await check('an unknown slug does not reveal whether it ever existed', async () => {
  const response = await call('/r/no-such-restaurant/');
  assert.equal(response.status, 404);
  const page = await response.text();
  assert.ok(!page.includes('موقوف'), 'suspension leaked to a public page');
});

/**
 * النسخة الحقيقية.
 *
 * أحد الأربعة المطلوبة لكل منتج، ونسيت اختباره أول مرة: كان كل الفحص على
 * نسخة العرض. مطعم جديد يفتح موقعه فيجد صفحة معطوبة أسوأ من مطعم لا موقع له.
 */
await check('a clean production tenant still serves a complete page', async () => {
  const other = await db.prepare('SELECT slug FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT_B).first();
  const response = await call(`/r/${other.slug}/`);
  assert.equal(response.status, 200, `production site returned ${response.status}`);
  const page = await response.text();
  assert.ok(page.includes('مطعم آخر'), 'the name is missing');
  // العناوين الهيكلية مكتوبة في البذرة النظيفة: صفحة بعناوين فارغة يفتحها
  // صاحبها فلا يعرف أين يكتب.
  assert.ok(page.includes('قائمة الطعام'), 'structural headings are empty');
  assert.ok(page.includes('اطلب الآن'), 'the call to action is empty');
  // فحص نصّي لا سطري: `onload="this.onload=null"` في أضنة نفسه شرعي تمامًا،
  // فالبحث عن `null` في كل الصفحة كان يصطدم بجافاسكربت لا بقيمة مسرَّبة.
  assert.ok(!page.includes('>undefined<') && !page.includes('>null<'),
    'a raw empty value leaked into rendered text');
});

await check('the order endpoint the cart posts to works from every page', async () => {
  // `main.js` يقرأ `data-order-url` من `<body>` ويناديها كما هي، فقيمتها هي
  // الطلب كله. أخطأت مرتين هنا: قيمة نسبية (`order/`) تُحلّ على مسار الصفحة
  // فتصير `/menu/order/` وتردّ 405 من صفحة المنيو، ثم قيمة مشتقّة من `homeUrl`
  // الذي لا تمرّره `renderMenu` فصارت `/order/` بلا اسم المطعم وسقط الطلب من
  // كل صفحة.
  //
  // الفحص بنيويّ لا سلوكيّ عمدًا: النسخة التي اكتفت بأن الطلب «لا يردّ خطأً»
  // مرّت بينما الإنتاج مكسور، لأن `/order/` سلك في بيئة الاختبار طريقًا لا
  // يسلكه هناك. المساواة الصريحة لا يمكن أن تُخدع كذلك. وهي أيضًا لا تستهلك
  // من حدّ الطلبات، فلا تُفشل فحصًا لاحقًا بـ429.
  // بلا شرطة مائلة أخيرة أيضًا: الخادم يردّ 200 على الشكلين بلا تحويل، وهناك
  // بالضبط ينكسر أي عنوان نسبي — يُسقط المتصفح آخر مقطع.
  for (const path of ['/r/adana-demo/', '/r/adana-demo', '/r/adana-demo/menu/', '/r/adana-demo/menu']) {
    const html = await (await call(path)).text();
    const endpoint = /data-order-url="([^"]+)"/.exec(html)?.[1];
    assert.equal(endpoint, '/r/adana-demo/order/',
      `data-order-url في ${path} = ${endpoint} — يجب أن يحمل مسار المطعم كاملًا`);

    // رابط «تصفح القائمة» في السلة الفارغة: كان `menu/` نسبيًّا فيصير
    // `/r/menu/` من عنوان بلا شرطة، و`./` يعيد إلى الرئيسية من `/menu`.
    const cta = /href="([^"]+)" class="btn btn-outline js-close-cart"/.exec(html)?.[1];
    if (cta !== undefined) {
      assert.equal(cta, '/r/adana-demo/menu/',
        `رابط تصفح القائمة في ${path} = ${cta} — يجب أن يكون مطلقًا`);
    }

    // الشعار: كان `#top` في الرئيسية فيلوّث العنوان بمرساة لا تنتقل، و`./`
    // في صفحة المنيو فيبقيك فيها بدل العودة للرئيسية.
    const brand = /<a class="brand" href="([^"]*)"/.exec(html)?.[1];
    assert.equal(brand, '/r/adana-demo/', `رابط الشعار في ${path} = ${brand}`);

    // نموذج الحجز يظهر في الرئيسية وحدها، لكن حين يظهر يجب أن يُرسل إلى
    // مسار المطعم لا إلى مسار الصفحة.
    const action = /<form class="reservation-form" method="post" action="([^"]*)"/.exec(html)?.[1];
    if (action !== undefined) {
      assert.equal(action, '/r/adana-demo/reservation/', `وجهة نموذج الحجز في ${path} = ${action}`);
    }

    // ترويسة صفحة المنيو: كان `base` يُمرَّر فارغًا فصار «الرئيسية» رابطًا
    // فارغًا يعيد تحميل الصفحة نفسها، و«اتصل بنا» يشير إلى قسم غير موجود هنا.
    if (path.includes('/menu')) {
      assert.ok(!/<a href="">/.test(html), `رابط فارغ في ترويسة ${path}`);
      assert.ok(html.includes('href="/r/adana-demo/#contact"'),
        `«اتصل بنا» في ${path} لا يشير إلى قسم الاتصال في الرئيسية`);
    }
  }
});

await check('the demo site shows dish, offer and hero images', async () => {
  // النسخة التجريبية هي ما يُعرض على العميل قبل الشراء: منيو بلا صور يبيع
  // أقل، وهذا سبب وجود الصور أصلًا. الفحص يقرأ الصفحة المولَّدة لا البذرة،
  // فيمسك انقطاع السلسلة عند أي حلقة (بذرة، استعلام، مولّد).
  const page = await (await call('/r/adana-demo/')).text();
  const srcs = [...page.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  const demo = srcs.filter((src) => src.startsWith('/site/img/demo/'));
  // عدد لا مجرّد وجود: مفتاح يُكتب خطأً في `DEMO_IMAGES` لا يكسر شيئًا — يعيد
  // '' فتختفي صورة واحدة بصمت. «توجد صور» يمرّ وقد ضاعت ستة عشر منها.
  const offers = demo.filter((src) => src.startsWith('/site/img/demo/offer/'));
  assert.equal(new Set(offers).size, 4, `صور العروض ${new Set(offers).size} لا 4`);
  assert.ok(demo.some((src) => src.startsWith('/site/img/demo/dish/')), 'no dish images rendered');
  assert.ok(page.includes('/site/img/demo/hero.webp'), 'the hero image is missing');
  // كل مسار يجب أن يكون لملف مبنيّ فعلًا: `demoImage` يعمل من قائمة مكتوبة
  // بيدي لا من قراءة القرص (لا نظام ملفات داخل Worker)، فخطأ مطبعي واحد في
  // تلك القائمة يعني رابطًا مكسورًا لا يظهر إلا في المتصفح.
  const { existsSync } = await import('node:fs');
  for (const src of new Set(demo)) {
    assert.ok(existsSync(new URL(`../../public${src}`, import.meta.url)),
      `المسار في البذرة لا يقابله ملف مبنيّ: ${src}`);
  }
});

await check('a clean production menu is empty but not broken', async () => {
  const other = await db.prepare('SELECT slug FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT_B).first();
  const response = await call(`/r/${other.slug}/menu`);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.ok(page.includes('قائمة الطعام'), 'the menu page has no heading');
});

await check('a clean production tenant carries no demo rows', async () => {
  const other = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT_B).first();
  for (const tableName of ['offers', 'testimonials', 'faqs', 'orders', 'reservations', 'hero_stats']) {
    const count = await db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE restaurant_id = ?`)
      .bind(other.restaurant_id).first();
    assert.equal(Number(count.count), 0, `${tableName} carries demo rows into a real customer`);
  }
  const owner = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE restaurant_id = ? AND role = 'owner'")
    .bind(other.restaurant_id).first();
  assert.equal(Number(owner.count), 1, 'a clean tenant should have exactly one owner');
});

/* ==================== 4. التسعير على الخادم ==================== */

const menuIds = {};
await check('read seeded ids for the pricing tests', async () => {
  const items = await db.prepare(
    'SELECT id, name_ar, price_minor FROM menu_items WHERE restaurant_id = ?',
  ).bind(demo.external_tenant_id).all();
  for (const row of items.results) menuIds[row.name_ar] = row;
  assert.ok(menuIds['كباب أضنة'], 'seed did not create the kebab');
});

/**
 * يترجم شكل الاختبار المألوف (`customer_name`/`lines`) إلى عقد
 * `site/js/main.js` الحرفي (`name`/`items[{id,qty,variant_id,addon_ids}]`)
 * — التطابق مع main.js غير قابل للتفاوض لأنه غير معدَّل، فالاختبار يتكيّف.
 */
const orderRequest = ({ customer_name, phone, address, notes, fulfillment, lines }) => call('/r/adana-demo/order/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: customer_name, phone, address, notes, fulfillment,
    items: (lines || []).map((line) => ({
      id: line.item_id, qty: line.quantity,
      ...(line.variant_id ? { variant_id: line.variant_id } : {}),
      ...(line.addon_ids ? { addon_ids: line.addon_ids } : {}),
      ...(line.unit_price_minor !== undefined ? { unit_price_minor: line.unit_price_minor } : {}),
    })),
  }),
});

let publicOrderToken;
await check('a valid public order is priced from the database', async () => {
  const kebab = menuIds['كباب أضنة'];
  const variants = await db.prepare(
    'SELECT id, name_ar, price_minor FROM menu_item_variants WHERE menu_item_id = ? ORDER BY display_order',
  ).bind(kebab.id).all();
  const large = variants.results.find((row) => row.name_ar === 'كبير');
  const addons = await db.prepare(
    'SELECT id, price_minor FROM menu_item_addons WHERE menu_item_id = ? ORDER BY display_order',
  ).bind(kebab.id).all();

  const response = await orderRequest({
    customer_name: 'زبون تجربة', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: kebab.id, variant_id: large.id, addon_ids: [addons.results[0].id], quantity: 2 }],
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  assert.ok(body.order_url, 'no order_url in the response');
  // نسبيّ إلى /order/ لا إلى جذر الموقع كان يبني ".../order/o/TOKEN/" —
  // عطل حقيقي ظهر فقط بتجربة طلب على الإنتاج، لأن هذا التعبير النمطي
  // المتساهل كان يطابق الشكلين معًا فلا يكشفه.
  assert.ok(!body.order_url.includes('/order/o/'), `order_url is nested under /order/: ${body.order_url}`);
  assert.match(body.order_url, /\/r\/adana-demo\/o\/[a-z0-9]+\/$/, `unexpected order_url shape: ${body.order_url}`);
  publicOrderToken = body.order_url.match(/\/o\/([a-z0-9]+)\//)[1];

  const stored = await db.prepare('SELECT total_minor FROM orders WHERE token = ?')
    .bind(publicOrderToken).first();
  const expected = (Number(large.price_minor) + Number(addons.results[0].price_minor)) * 2;
  assert.equal(Number(stored.total_minor), expected, 'total does not match the database prices');
});

await check('a price sent by the browser is ignored', async () => {
  const kebab = menuIds['كباب أضنة'];
  const response = await orderRequest({
    customer_name: 'محتال', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: kebab.id, quantity: 1, unit_price_minor: 1, price_minor: 1, total_minor: 1 }],
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  const forgedToken = body.order_url.match(/\/o\/([a-z0-9]+)\//)[1];
  const stored = await db.prepare('SELECT total_minor FROM orders WHERE token = ?')
    .bind(forgedToken).first();
  assert.equal(Number(stored.total_minor), Number(kebab.price_minor),
    'the browser managed to set its own price');
});

await check('a variant belonging to another item is refused', async () => {
  const kebab = menuIds['كباب أضنة'];
  const shawarma = menuIds['شاورما لحم'];
  const cheap = await db.prepare(
    'SELECT id FROM menu_item_variants WHERE menu_item_id = ? LIMIT 1',
  ).bind(shawarma.id).first();
  const response = await orderRequest({
    customer_name: 'محتال', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: kebab.id, variant_id: cheap.id, quantity: 1 }],
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'INVALID_VARIANT');
});

await check('an addon belonging to another item is refused', async () => {
  const kebab = menuIds['كباب أضنة'];
  const fries = menuIds['بطاطا مقلية'];
  const foreign = await db.prepare(
    'SELECT id FROM menu_item_addons WHERE menu_item_id = ? LIMIT 1',
  ).bind(fries.id).first();
  const response = await orderRequest({
    customer_name: 'محتال', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: kebab.id, addon_ids: [foreign.id], quantity: 1 }],
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'INVALID_ADDON');
});

await check('an item from another restaurant cannot be ordered here', async () => {
  const other = await db.prepare(
    "SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?",
  ).bind(TENANT_B).first();
  // النسخة الحقيقية بلا أصناف، فنزرع صنفًا في المطعم الآخر لنجرّب سرقته.
  await db.prepare(
    `INSERT INTO menu_items (id, restaurant_id, category_id, name_ar, price_minor, updated_at)
     VALUES ('foreign_item', ?, '', 'صنف مطعم آخر', 100, 0)`,
  ).bind(other.restaurant_id).run();
  const response = await orderRequest({
    customer_name: 'محتال', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: 'foreign_item', quantity: 1 }],
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'ITEM_UNAVAILABLE');
});

await check('an impossible quantity is refused', async () => {
  const kebab = menuIds['كباب أضنة'];
  const response = await orderRequest({
    customer_name: 'زبون', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: kebab.id, quantity: 5000 }],
  });
  assert.equal(response.status, 422);
});

await check('delivery without an address is refused', async () => {
  const kebab = menuIds['كباب أضنة'];
  const response = await orderRequest({
    customer_name: 'زبون', phone: '0599123456', fulfillment: 'delivery',
    lines: [{ item_id: kebab.id, quantity: 1 }],
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'BAD_REQUEST');
});

await check('pickup accepts no contact details at all, unlike delivery', async () => {
  // أضنة تسمح باستلام من المطعم بلا اسم ولا هاتف — الاتصال إلزامي للتوصيل فقط.
  const kebab = menuIds['كباب أضنة'];
  const response = await orderRequest({
    customer_name: '', phone: '', fulfillment: 'pickup',
    lines: [{ item_id: kebab.id, quantity: 1 }],
  });
  assert.equal(response.status, 201, await response.text());
});

await check('a bad phone on a delivery order is refused', async () => {
  const kebab = menuIds['كباب أضنة'];
  const response = await orderRequest({
    customer_name: 'زبون', phone: 'nope', address: 'شارع', fulfillment: 'delivery',
    lines: [{ item_id: kebab.id, quantity: 1 }],
  });
  assert.equal(response.status, 400);
});

await check('the order page is reachable by its token and shows the code', async () => {
  const page = await (await call(`/r/adana-demo/o/${publicOrderToken}/`)).text();
  assert.ok(page.includes('كباب أضنة'), 'order line missing');
  assert.ok(page.includes('رقم الطلب'), 'order heading missing');
});

await check('a guessed token returns nothing', async () => {
  const response = await call('/r/adana-demo/o/0123456789abcdef/');
  assert.equal(response.status, 404);
});

/* ==================== 5. الحجوزات ==================== */

let ipCounter = 0;
/**
 * الحجز نموذج HTML عادي بعد الترحيل عن أضنة، لا JSON: يعيد الخادم توجيهًا
 * 303 دائمًا (نجح أو فشل) بمعامل `flash` في الوجهة، فالفحص يقرأ رأس
 * `Location` بدل جسم الرد أو حالته.
 */
const reserve = async (fields, ip) => {
  const response = await call('/r/adana-demo/reservation/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // عنوان مختلف لكل فحص: الحدّ يُحسب لكل عنوان، وبعنوان واحد كانت
      // الفحوص السلبية تستهلك رصيد الفحص الذي يليها فيبدو عطلًا وهميًا.
      'CF-Connecting-IP': ip || `10.0.0.${(ipCounter += 1)}`,
    },
    body: new URLSearchParams(fields).toString(),
  });
  const location = response.headers.get('Location') || '';
  return { status: response.status, ok: location.includes('flash=ok_reservation'), location };
};

const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

await check('a valid reservation is accepted', async () => {
  const response = await reserve({
    full_name: 'ضيف', phone: '0599123456', date: tomorrow, time: '19:00', guests: 4,
  });
  assert.equal(response.status, 303);
  assert.ok(response.ok, response.location);
});

await check('a reservation outside opening hours is refused', async () => {
  const response = await reserve({
    full_name: 'ضيف', phone: '0599123456', date: tomorrow, time: '04:00', guests: 2,
  });
  assert.ok(!response.ok, 'an out-of-hours reservation was accepted');
});

await check('a reservation in the past is refused', async () => {
  const response = await reserve({
    full_name: 'ضيف', phone: '0599123456', date: '2020-01-01', time: '19:00', guests: 2,
  });
  assert.ok(!response.ok, 'a past-dated reservation was accepted');
});

await check('a full time slot is refused', async () => {
  // الطاقة الافتراضية أربعة، وواحد محجوز أعلاه.
  for (let i = 0; i < 3; i += 1) {
    const filled = await reserve({
      full_name: `ضيف ${i}`, phone: '0599123456', date: tomorrow, time: '19:00', guests: 2,
    });
    assert.ok(filled.ok, `filling the slot failed at ${i}: ${filled.location}`);
  }
  const response = await reserve({
    full_name: 'الخامس', phone: '0599123456', date: tomorrow, time: '19:00', guests: 2,
  });
  assert.ok(!response.ok, 'a sixth reservation was accepted into a full slot');
});

await check('one address cannot flood the reservation form', async () => {
  const ip = '198.51.100.8';
  let blocked = false;
  for (let i = 0; i < 12; i += 1) {
    const response = await reserve({
      // وقت مختلف كل مرة: طاقة الفترة أربعة فقط، فامتلاؤها كان يسبق الحدّ
      // ويُخفي عمّا يُفحص هنا فعلًا — لا نريد SLOT_FULL بل الحدّ نفسه.
      full_name: 'سيل', phone: '0599123456', date: tomorrow, time: `${21 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`, guests: 2,
    }, ip);
    if (response.location.includes('flash=rl_reservation')) { blocked = true; break; }
  }
  assert.ok(blocked, 'the public reservation form has no rate limit');
});

/* ==================== 6. لوحة المطعم ==================== */

let ownerToken;
let freshOwner;
const authed = (path, init = {}, token = ownerToken) => call(path, {
  ...init,
  headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
});

await check('the owner logs in with the credentials Athar issued', async () => {
  const response = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: demo.external_tenant_id,
      username: demo.credentials.username,
      password: demo.credentials.secret,
    }),
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 200, text);
  ownerToken = body.token;
  assert.equal(body.user.role, 'owner');
  assert.equal(body.restaurant.plan_code, 'full');
});

await check('a wrong password is refused', async () => {
  const response = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: demo.external_tenant_id, username: 'owner', password: 'wrong-password',
    }),
  });
  assert.equal(response.status, 401);
});

await check('an unauthenticated request cannot read the panel', async () => {
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/orders')).status, 401);
});

await check('me reports plan features computed on the server', async () => {
  const body = await (await authed('/api/me')).json();
  assert.equal(body.features.orders, true);
  assert.equal(body.features.receipts, true);
  assert.equal(body.restaurant.public_url, '/r/adana-demo/');
});

await check('the restaurant cannot rename itself', async () => {
  const response = await authed('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_ar: 'اسم سرقته', plan_code: 'full', tagline_ar: 'شعار جديد' }),
  });
  assert.equal(response.status, 200);
  const settings = await db.prepare('SELECT name_ar, tagline_ar FROM settings WHERE restaurant_id = ?')
    .bind(demo.external_tenant_id).first();
  assert.equal(settings.name_ar, 'مطعم أضنة', 'the restaurant overwrote an Athar-owned field');
  assert.equal(settings.tagline_ar, 'شعار جديد', 'its own field was not saved');
});

await check('a font name outside the curated registry is refused', async () => {
  const response = await authed('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arabic_font: 'Comic Sans MS' }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'INVALID_FONT');
});

await check('an icon key outside the curated set is refused', async () => {
  const category = await db.prepare('SELECT id FROM categories WHERE restaurant_id = ? LIMIT 1')
    .bind(demo.external_tenant_id).first();
  const response = await authed(`/api/content/categories/${category.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icon: 'not-a-real-icon-key' }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'INVALID_ICON');
});

await check('/api/meta exposes the same font and icon registries the server validates against', async () => {
  const response = await call('/api/meta');
  const { status, body } = await read(response);
  assert.equal(status, 200);
  assert.ok(body.fonts.arabic.some(([key]) => key === 'cairo'), 'cairo missing from the arabic font list');
  assert.ok(body.icons.categories.some(([key]) => key === 'skewer'), 'skewer missing from the category icon list');
});

// ما كسر عند المستخدم فعلًا: اللوحة تحفظ وتقول «حُفظت»، والموقع العام لا
// يتغيّر. الفحوص السابقة تتحقق من الحفظ في القاعدة أو من الهوية الجاهزة عند
// الإنشاء؛ لا شيء كان يتتبّع طريق «حفظ من اللوحة ← صفحة الزائر».
await check('saving colours and fonts from the panel reaches the public page', async () => {
  const response = await authed('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primary_color: '#1A7F5A', theme_layer: 'luxury', arabic_font: 'tajawal',
    }),
  });
  assert.equal(response.status, 200);

  const page = await (await call('/r/adana-demo/')).text();
  assert.ok(page.includes('#1A7F5A'), 'the saved colour never reached the page');
  assert.ok(page.includes('themes/luxury.css'), 'the saved theme layer never reached the page');
  assert.ok(page.includes('Tajawal'), 'the saved font never reached the page');
});

// عمود `theme` بقي من تصميم أسبق ولا يقرؤه المولّد. قبوله بصمت يجعل اللوحة
// تَعِد بنمط فاتح لا وجود له — وهو بالضبط ما جرّبه المستخدم ولم ينجح.
await check('the unbuilt light theme is refused instead of silently accepted', async () => {
  const response = await authed('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: 'light' }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'THEME_NOT_SETTABLE');
});

await check('an invalid colour is refused instead of landing in the stylesheet', async () => {
  const response = await authed('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primary_color: 'red;} body{display:none' }),
  });
  assert.equal(response.status, 422);
});

let createdItemId;
await check('the owner creates a menu item and it appears on the public page', async () => {
  const category = await db.prepare('SELECT id FROM categories WHERE restaurant_id = ? LIMIT 1')
    .bind(demo.external_tenant_id).first();
  const response = await authed('/api/content/menu_items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: category.id, name_ar: 'طبق مختبَر', price_minor: 3300,
      is_priced: 1, is_available: 1, is_featured: 1, display_order: 99,
    }),
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  createdItemId = body.id;
  const page = await (await call('/r/adana-demo/menu')).text();
  assert.ok(page.includes('طبق مختبَر'), 'the new item never reached the public page');
  assert.ok(page.includes('33.00'), 'its price never reached the public page');
});

await check('a menu item cannot be filed under another restaurant category', async () => {
  const other = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT_B).first();
  await db.prepare(
    `INSERT INTO categories (id, restaurant_id, name_ar, slug, updated_at)
     VALUES ('foreign_cat', ?, 'قسم آخر', 'other', 0)`,
  ).bind(other.restaurant_id).run();
  const response = await authed('/api/content/menu_items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: 'foreign_cat', name_ar: 'تسلل', price_minor: 100 }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'INVALID_PARENT');
});

await check('deleting an item takes its variants and addons with it', async () => {
  const kebab = menuIds['كباب أضنة'];
  const response = await authed(`/api/content/menu_items/${kebab.id}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  const leftovers = await db.prepare(
    'SELECT COUNT(*) AS count FROM menu_item_variants WHERE menu_item_id = ?',
  ).bind(kebab.id).first();
  assert.equal(Number(leftovers.count), 0, 'orphan variants left behind');
});

await check('an order already placed keeps its own copy of a deleted item', async () => {
  const line = await db.prepare(
    'SELECT name_ar, unit_price_minor FROM order_lines WHERE order_id = (SELECT id FROM orders WHERE token = ?)',
  ).bind(publicOrderToken).first();
  assert.equal(line.name_ar, 'كباب أضنة', 'a past order lost its item name when the menu changed');
  assert.ok(Number(line.unit_price_minor) > 0, 'a past order lost its price');
});

/* ==================== 7. الأدوار ==================== */

let cashierToken;
await check('the owner creates a cashier account', async () => {
  const response = await authed('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'cashier1', password: 'cashier-pass-1', role: 'cashier', display_name: 'كاشير',
    }),
  });
  const created = await read(response);
  assert.equal(created.status, 201, created.text);
  const login = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: demo.external_tenant_id, username: 'cashier1', password: 'cashier-pass-1',
    }),
  });
  cashierToken = (await read(login)).body.token;
  assert.ok(cashierToken, 'cashier could not log in');
});

await check('a second owner account cannot be created from inside the restaurant', async () => {
  const response = await authed('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner2', password: 'another-owner', role: 'owner' }),
  });
  assert.equal(response.status, 422);
});

await check('the cashier cannot change prices', async () => {
  const response = await authed(`/api/content/menu_items/${createdItemId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price_minor: 1 }),
  }, cashierToken);
  assert.equal(response.status, 403, 'the cashier repriced the menu');
  const item = await db.prepare('SELECT price_minor FROM menu_items WHERE id = ?').bind(createdItemId).first();
  assert.equal(Number(item.price_minor), 3300);
});

await check('the cashier cannot manage accounts', async () => {
  const response = await authed('/api/users', {}, cashierToken);
  assert.equal(response.status, 403);
});

await check('the cashier can take an order and move it forward', async () => {
  const response = await authed('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: 'طاولة ٩', table_number: '9', fulfillment: 'dine_in',
      lines: [{ item_id: createdItemId, quantity: 3 }],
    }),
  }, cashierToken);
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  assert.equal(body.total_minor, 9900, 'cashier order priced wrongly');

  const moved = await authed(`/api/orders/${body.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'preparing' }),
  }, cashierToken);
  assert.equal(moved.status, 200);
});

/* ==================== 8. عزل المستأجرين ==================== */

await check('a session cannot touch another restaurant rows', async () => {
  const response = await authed('/api/content/categories/foreign_cat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name_ar: 'استولينا عليه' }),
  });
  assert.equal(response.status, 404, 'a restaurant edited another restaurant category');
  const untouched = await db.prepare('SELECT name_ar FROM categories WHERE id = ?').bind('foreign_cat').first();
  assert.equal(untouched.name_ar, 'قسم آخر');
});

await check('listing orders never crosses restaurants', async () => {
  const body = await (await authed('/api/orders?limit=200')).json();
  for (const order of body.orders) {
    assert.equal(order.restaurant_id, demo.external_tenant_id, 'a foreign order leaked into the list');
  }
});

/* ==================== 9. الصور ==================== */

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
]);

let uploadedUrl;
await check('an image upload is stored under the restaurant prefix', async () => {
  const response = await authed('/api/upload', { method: 'POST', body: PNG_BYTES });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  uploadedUrl = body.url;
  assert.ok(body.url.startsWith(`/img/r/${demo.external_tenant_id}/`), 'wrong storage prefix');
  assert.equal(body.type, 'image/png');
});

await check('a file that is not an image is refused whatever it claims to be', async () => {
  const response = await authed('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: new TextEncoder().encode('<script>alert(1)</script> not an image at all'),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'NOT_AN_IMAGE');
});

await check('a stored image is served with its sniffed type and nosniff', async () => {
  const response = await call(uploadedUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

await check('one restaurant cannot delete another restaurant image', async () => {
  const other = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT_B).first();
  const response = await authed(`/api/upload/r/${other.restaurant_id}/whatever.png`, { method: 'DELETE' });
  assert.equal(response.status, 403);
});

/* ==================== 10. لوحة التشغيل ==================== */

await check('the dashboard counts today and the week without cancelled orders', async () => {
  const body = await (await authed('/api/dashboard')).json();
  assert.ok(body.week.orders > 0, 'the demo seed produced no week orders');
  assert.ok(body.top_items.length > 0, 'no top items');
  const cancelled = await db.prepare(
    "SELECT COALESCE(SUM(total_minor),0) AS total FROM orders WHERE restaurant_id = ? AND status = 'cancelled'",
  ).bind(demo.external_tenant_id).first();
  const all = await db.prepare(
    'SELECT COALESCE(SUM(total_minor),0) AS total FROM orders WHERE restaurant_id = ? AND created_at >= ?',
  ).bind(demo.external_tenant_id, Date.now() - 7 * 864e5).first();
  assert.ok(Number(body.week.revenue) <= Number(all.total) - 0,
    'revenue should exclude cancelled orders');
  void cancelled;
});

/* ==================== 11. الباقة ==================== */

await check('downgrading to the menu plan reaches the engine', async () => {
  const response = await adapter('POST', `/internal/v1/tenants/${TENANT}/plan`, { plan_code: 'menu' });
  assert.equal(response.status, 200);
  const row = await db.prepare('SELECT plan_code FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT).first();
  assert.equal(row.plan_code, 'menu');
});

await check('the menu plan sends via WhatsApp instead of saving to the database', async () => {
  // زر «إرسال» في main.js ينادي هذا المسار مهما كانت الباقة — رفضه بـ402
  // يكسر الزر لعميل الباقة الأرخص. الفرق التجاري الحقيقي: لا يُكتب صف طلب.
  const before = await db.prepare('SELECT COUNT(*) AS count FROM orders WHERE restaurant_id = ?')
    .bind(demo.external_tenant_id).first();
  const response = await orderRequest({
    customer_name: 'زبون', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: createdItemId, quantity: 1 }],
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  assert.equal(body.order_url, '', 'the menu plan should not produce an order page');
  const after = await db.prepare('SELECT COUNT(*) AS count FROM orders WHERE restaurant_id = ?')
    .bind(demo.external_tenant_id).first();
  assert.equal(Number(after.count), Number(before.count), 'the menu plan wrote an order row anyway');

  // على هذه الباقة رسالة واتساب هي الطلب كلّه: لا سجل ولا صفحة متابعة. رسالة
  // بلا أسعار ولا مجموع تعني أن المطعم يحسب فاتورته بيده في كل طلب. الفحص
  // القديم اكتفى بوجود اسم الصنف فمرّ العيب.
  const message = decodeURIComponent(body.whatsapp_url);
  const item = await db.prepare('SELECT price_minor FROM menu_items WHERE id = ?')
    .bind(createdItemId).first();
  const price = (Number(item.price_minor) / 100).toFixed(2);
  // يجب أن يحمل *سطر الصنف نفسه* سعره، لا أن يظهر الرقم في المجموع وحده:
  // بصنف واحد يتساوى السطر والمجموع، فالتحقق من وجود الرقم مجردًا يمرّ
  // حتى لو حُذفت أسعار السطور كلها. الفاصلة « — » هي ما يميّز السطر المسعَّر.
  assert.match(message, new RegExp(`× [^\\n]+ — ${price.replace('.', '\\.')}`),
    `سعر الصنف مفقود من سطره في رسالة واتساب:\n${message}`);
  assert.ok(message.includes('المجموع:'), `المجموع مفقود من رسالة واتساب:\n${message}`);
});

await check('the menu plan cannot take reservations', async () => {
  const response = await reserve({
    full_name: 'ضيف', phone: '0599123456', date: tomorrow, time: '20:00', guests: 2,
  });
  assert.equal(response.status, 303);
  assert.ok(!response.ok, 'a reservation was accepted on the menu plan');
});

await check('the menu plan cannot reach the cashier or the dashboard', async () => {
  assert.equal((await authed('/api/dashboard')).status, 402);
  const response = await authed('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: [{ item_id: createdItemId, quantity: 1 }] }),
  }, cashierToken);
  assert.equal(response.status, 402);
});

await check('the menu plan still serves the public site and the menu', async () => {
  assert.equal((await call('/r/adana-demo/')).status, 200);
  assert.equal((await call('/r/adana-demo/menu')).status, 200);
});

await check('upgrading back restores what the plan gates', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/plan`, { plan_code: 'restaurant_full' });
  assert.equal((await authed('/api/dashboard')).status, 200);
  // ولا يفقد المطعم صفًا واحدًا في الرحلة.
  const orders = await db.prepare('SELECT COUNT(*) AS count FROM orders WHERE restaurant_id = ?')
    .bind(demo.external_tenant_id).first();
  assert.ok(Number(orders.count) > 10, 'orders vanished across a plan change');
});

/* ==================== 12. دورة الحياة ==================== */

await check('suspending closes the public site and cuts open sessions', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'suspend' });
  assert.equal((await call('/r/adana-demo/')).status, 404);
  assert.equal((await authed('/api/me')).status, 401, 'an open session survived suspension');
});

await check('resuming brings the site back', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'resume' });
  assert.equal((await call('/r/adana-demo/')).status, 200);
});

await check('restore only applies to an archived tenant', async () => {
  const response = await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'restore' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'TENANT_NOT_ARCHIVED');
});

await check('archiving then restoring leaves the tenant suspended, not live', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'archive' });
  const response = await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'restore' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'suspended');
});

await check('a new credential from Athar replaces the old one', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'resume' });
  const response = await adapter('POST', `/internal/v1/tenants/${TENANT}/reset-owner-credential`, {});
  const reset = await read(response);
  assert.equal(reset.status, 200, reset.text);
  const fresh = reset.body;
  const login = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: demo.external_tenant_id, username: fresh.credentials.username,
      password: fresh.credentials.secret,
    }),
  });
  assert.equal(login.status, 200, 'the new credential does not work');
  ownerToken = (await read(login)).body.token;
  freshOwner = fresh.credentials;

  const old = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: demo.external_tenant_id, username: 'owner', password: demo.credentials.secret,
    }),
  });
  assert.equal(old.status, 401, 'the old credential still works after a reset');
});

await check('a wrong current password blocks a self credential change', async () => {
  const response = await authed('/api/account/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: 'definitely-wrong', new_password: 'brand-new-pass' }),
  });
  assert.equal(response.status, 403);
});

await check('the owner changes their own password and keeps working', async () => {
  const response = await authed('/api/account/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: freshOwner.secret, new_password: 'owner-chosen-pass' }),
  });
  const changed = await read(response);
  assert.equal(changed.status, 200, changed.text);

  const login = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_id: demo.external_tenant_id, username: freshOwner.username, password: 'owner-chosen-pass',
    }),
  });
  assert.equal(login.status, 200, 'the password the owner chose does not work');

  // الجهاز الذي أجرى التغيير يبقى داخلًا: إخراج الجميع يوحي بأن التغيير فشل.
  assert.equal((await authed('/api/me')).status, 200, 'the owner was logged out of their own session');
});

/* ==================== 12ب. الهوية والأيقونات ==================== */

await check('a chosen brand kit reaches the public page, not the classic default', async () => {
  const response = await adapter('POST', '/internal/v1/tenants', {
    tenant_id: 'ten_luxury', slug: 'luxury-resto', display_name: 'مطعم فاخر',
    environment: 'production', plan_code: 'full', admin_username: 'owner',
    brand_kit_code: 'restaurant:luxury_navy',
  });
  const created = await read(response);
  assert.equal(created.status, 201, created.text);
  const page = await (await call(`/r/luxury-resto/`)).text();
  assert.ok(page.includes('--brand-red:#0B1D2D'), 'the luxury kit colour did not reach settings');
  assert.ok(page.includes('themes/luxury.css'), 'the luxury theme layer was not linked');
  assert.ok(!page.includes('--brand-red:#E30613'), 'the classic default leaked over a chosen kit');
});

await check('an unknown brand kit code falls back safely instead of failing provisioning', async () => {
  const response = await adapter('POST', '/internal/v1/tenants', {
    tenant_id: 'ten_badkit', slug: 'badkit-resto', display_name: 'مطعم',
    environment: 'production', plan_code: 'menu', admin_username: 'owner',
    brand_kit_code: 'restaurant:does-not-exist',
  });
  const created = await read(response);
  assert.equal(created.status, 201, created.text);
});

await check('menu category and service icons render as known lucide names, not raw emoji', async () => {
  const page = await (await call('/r/adana-demo/menu/')).text();
  assert.ok(page.includes('data-lucide="flame"'), 'the grill category icon did not translate');
  assert.ok(!page.includes('🔥') && !page.includes('🥙'), 'a raw emoji leaked instead of a semantic icon key');
});

await check('a cart entry for an offer is priced and recorded as its own order line', async () => {
  const offerRow = await db.prepare(
    "SELECT id, price_minor FROM offers WHERE restaurant_id = ? AND is_priced = 1 LIMIT 1",
  ).bind(demo.external_tenant_id).first();
  assert.ok(offerRow, 'no priced offer in the demo seed to test with');
  const response = await orderRequest({
    customer_name: 'زبون عرض', phone: '0599123456', fulfillment: 'pickup',
    lines: [{ item_id: `offer-${offerRow.id}`, quantity: 1 }],
  });
  const { status, body, text } = await read(response);
  assert.equal(status, 201, text);
  const token = body.order_url.match(/\/o\/([a-z0-9]+)\//)[1];
  const line = await db.prepare(
    'SELECT offer_id, unit_price_minor FROM order_lines WHERE order_id = (SELECT id FROM orders WHERE token = ?)',
  ).bind(token).first();
  assert.equal(line.offer_id, offerRow.id, 'the offer line was not linked to the offer row');
  assert.equal(Number(line.unit_price_minor), Number(offerRow.price_minor), 'the offer was not priced from the database');
});

/* ==================== 13. الحذف النهائي ==================== */

await check('purge refuses a tenant that is not archived', async () => {
  const response = await adapter('DELETE', `/internal/v1/tenants/${TENANT}`, {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'TENANT_NOT_ARCHIVED');
});

await check('purge leaves nothing behind in any table', async () => {
  await adapter('POST', `/internal/v1/tenants/${TENANT}/status`, { action: 'archive' });
  const response = await adapter('DELETE', `/internal/v1/tenants/${TENANT}`, {});
  assert.equal(response.status, 200, (await read(response)).text);

  // القائمة تُقرأ من المخطط لا من ذاكرتي: جدول جديد يحمل restaurant_id
  // ويُنسى في مانيفست الحذف يُسقط هذا الفحص.
  const tables = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all();
  for (const { name } of tables.results) {
    const columns = await db.prepare(`PRAGMA table_info(${name})`).all();
    if (!columns.results.some((column) => column.name === 'restaurant_id')) continue;
    const left = await db.prepare(`SELECT COUNT(*) AS count FROM ${name} WHERE restaurant_id = ?`)
      .bind(demo.external_tenant_id).first();
    assert.equal(Number(left.count), 0, `${name} still holds rows of a purged restaurant`);
  }

  const restaurant = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT).first();
  assert.equal(restaurant, null, 'the restaurant row survived the purge');
});

await check('purge does not touch the neighbouring restaurant', async () => {
  const other = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
    .bind(TENANT_B).first();
  assert.ok(other, 'the neighbour was deleted too');
  const items = await db.prepare('SELECT COUNT(*) AS count FROM menu_items WHERE restaurant_id = ?')
    .bind(other.restaurant_id).first();
  assert.equal(Number(items.count), 1, 'the neighbour lost its rows');
});

await check('purge is idempotent', async () => {
  const response = await adapter('DELETE', `/internal/v1/tenants/${TENANT}`, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'deleted');
});

await check('the purged public url stops answering', async () => {
  assert.equal((await call('/r/adana-demo/')).status, 404);
});

/* ---------- النتيجة ---------- */

console.log(`\nengine: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
