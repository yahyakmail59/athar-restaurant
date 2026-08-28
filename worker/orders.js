/**
 * الطلبات والحجوزات.
 *
 * القاعدة الحاكمة: **السعر يُحسب على الخادم من قاعدة البيانات**. المتصفح
 * يرسل معرّفات وكميات لا أرقامًا. أي صفحة تُرسل السعر تجعل تعديل عنصر واحد
 * في أدوات المطوّر كافيًا لشراء وجبة بشيكل، وهذا ما يجعل الإيصال المرسوم
 * على الخادم ذا معنى أصلًا.
 *
 * مسار عام واحد بعقدين: `publicOrder` يخدم `site/js/main.js` المنسوخ حرفيًا
 * عن أضنة (يرسل `{items:[{id,qty,variant_id,addon_ids}], fulfillment, name,
 * phone, address, notes}` ويتوقع `{code, order_url, whatsapp_url}`)، بينما
 * `createOrder`/`cashierOrder` الداخلي (تستدعيه `admin.js` بجلسة) يبقى بعقده
 * القديم — لا علاقة لأضنة بلوحة المطعم الداخلية.
 */

import {
  HttpError, json, money, num, orderCode, str,
} from './lib.js';
import { planAllows } from './access.js';

const MAX_LINES = 40;
const MAX_QUANTITY = 99;

/**
 * حدّ معدّل بسيط فوق جدول محاولات الدخول.
 *
 * الجدول عدّاد عام لا خاص بكلمات المرور. النموذج العام يستقبل من الإنترنت
 * بلا حساب، فبلا حدّ يمكن ملء طاولات المطعم كلها من متصفح واحد.
 */
async function rateLimit(db, key, max, windowMs) {
  const now = Date.now();
  const row = await db.prepare('SELECT fails, locked_until FROM login_attempts WHERE key = ?').bind(key).first();
  if (row && Number(row.locked_until) > now) {
    throw new HttpError(429, 'TOO_MANY_REQUESTS', 'محاولات كثيرة. حاول بعد قليل.');
  }
  const fails = Number(row?.fails || 0) + 1;
  const locked = fails >= max ? now + windowMs : 0;
  await db.prepare(
    `INSERT INTO login_attempts (key, fails, locked_until) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET fails = ?, locked_until = ?`,
  ).bind(key, fails, locked, locked ? 0 : fails, locked).run();
}

const placeholders = (count) => new Array(count).fill('?').join(', ');

/**
 * يحوّل سطورًا مرسلة من متصفح إلى سطور مسعّرة.
 *
 * كل معرّف يُقرأ مقيّدًا بـ`restaurant_id`، والحجم والإضافة يجب أن ينتميا
 * إلى الصنف نفسه. الشرط الأخير ليس تجميلًا: بدونه يُلصق «حجم صغير» من صنف
 * رخيص بصنف غالٍ، فيُشترى الكباب بسعر الشاي.
 */
export async function priceLines(env, restaurantId, rawLines, lang = 'ar') {
  if (!Array.isArray(rawLines) || !rawLines.length) {
    throw new HttpError(422, 'EMPTY_ORDER', 'الطلب فارغ.');
  }
  if (rawLines.length > MAX_LINES) {
    throw new HttpError(422, 'TOO_MANY_LINES', 'عدد الأصناف أكبر من المسموح.');
  }

  const itemIds = [...new Set(rawLines.map((line) => str(line.item_id, 120)).filter(Boolean))];
  if (!itemIds.length) throw new HttpError(422, 'EMPTY_ORDER', 'الطلب فارغ.');

  const variantIds = [...new Set(rawLines.map((line) => str(line.variant_id, 120)).filter(Boolean))];
  const addonIds = [...new Set(rawLines.flatMap((line) =>
    (Array.isArray(line.addon_ids) ? line.addon_ids : []).map((id) => str(id, 120)).filter(Boolean)))];

  const db = env.DB;
  const queries = [
    db.prepare(
      `SELECT id, name_ar, name_en, price_minor, is_priced FROM menu_items
       WHERE restaurant_id = ? AND is_available = 1 AND id IN (${placeholders(itemIds.length)})`,
    ).bind(restaurantId, ...itemIds),
  ];
  if (variantIds.length) {
    queries.push(db.prepare(
      `SELECT id, menu_item_id, name_ar, name_en, price_minor FROM menu_item_variants
       WHERE restaurant_id = ? AND is_active = 1 AND id IN (${placeholders(variantIds.length)})`,
    ).bind(restaurantId, ...variantIds));
  }
  if (addonIds.length) {
    queries.push(db.prepare(
      `SELECT id, menu_item_id, name_ar, name_en, price_minor FROM menu_item_addons
       WHERE restaurant_id = ? AND is_active = 1 AND id IN (${placeholders(addonIds.length)})`,
    ).bind(restaurantId, ...addonIds));
  }
  const results = await db.batch(queries);
  const items = new Map(results[0].results.map((row) => [row.id, row]));
  const variants = new Map((variantIds.length ? results[1].results : []).map((row) => [row.id, row]));
  const addons = new Map((addonIds.length ? results[variantIds.length ? 2 : 1].results : [])
    .map((row) => [row.id, row]));

  const priced = [];
  let total = 0;
  let hasUnpriced = 0;

  for (const raw of rawLines) {
    const item = items.get(str(raw.item_id, 120));
    if (!item) throw new HttpError(409, 'ITEM_UNAVAILABLE', 'أحد الأصناف لم يعد متاحًا. حدّث القائمة.');

    const quantity = num(raw.quantity) || 1;
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      throw new HttpError(422, 'INVALID_QUANTITY', 'الكمية غير مقبولة.');
    }

    const variantId = str(raw.variant_id, 120);
    let variant = null;
    if (variantId) {
      variant = variants.get(variantId);
      if (!variant || variant.menu_item_id !== item.id) {
        throw new HttpError(409, 'INVALID_VARIANT', 'الحجم المختار لا يخص هذا الصنف.');
      }
    }

    const chosen = [];
    for (const rawId of (Array.isArray(raw.addon_ids) ? raw.addon_ids : [])) {
      const addon = addons.get(str(rawId, 120));
      if (!addon || addon.menu_item_id !== item.id) {
        throw new HttpError(409, 'INVALID_ADDON', 'إحدى الإضافات لا تخص هذا الصنف.');
      }
      chosen.push(addon);
    }

    const isPriced = Number(item.is_priced) === 1;
    const base = variant ? Number(variant.price_minor) : Number(item.price_minor);
    const unit = isPriced ? base + chosen.reduce((sum, addon) => sum + Number(addon.price_minor), 0) : 0;
    if (isPriced) total += unit * quantity; else hasUnpriced = 1;

    priced.push({
      menu_item_id: item.id,
      name_ar: item.name_ar,
      name_en: item.name_en,
      variant_name_ar: variant ? (lang === 'en' ? variant.name_en || variant.name_ar : variant.name_ar) : '',
      addons_json: JSON.stringify(chosen.map((addon) => ({
        name_ar: addon.name_ar, name_en: addon.name_en, price_minor: Number(addon.price_minor),
      }))),
      quantity,
      unit_price_minor: unit,
      is_priced: isPriced ? 1 : 0,
      price_note: isPriced ? '' : (lang === 'en' ? 'On request' : 'حسب الطلب'),
    });
  }

  return { lines: priced, total, hasUnpriced };
}

/**
 * ينشئ طلبًا. المصدر يقرر ما يُطلب من حقول: طلب من الموقع يحتاج هاتفًا،
 * وطلب من الكاشير يحتاج طاولة أو اسمًا فقط لأن الزبون واقف أمامه.
 *
 * تُستدعى من مسارين: `publicOrder` أدناه (زائر عام)، و`admin.js#cashierOrder`
 * (موظف بجلسة). كلاهما يمرّ سطوره أولًا على `priceLines`/`priceCartLines`،
 * فالتسعير الخادمي واحد لا نسختان قد تنحرفان.
 */
export async function createOrder(env, restaurant, settings, body, { source, cashierId = null, lang = 'ar' }) {
  if (!planAllows(restaurant.plan_code, 'orders')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'حفظ الطلبات جزء من الباقة الكاملة.');
  }
  const fulfillment = ['pickup', 'delivery', 'dine_in'].includes(body.fulfillment)
    ? body.fulfillment : (source === 'cashier' ? 'dine_in' : 'pickup');

  const customerName = str(body.customer_name, 80).trim();
  const phone = str(body.phone, 30).trim();
  const address = str(body.address, 200).trim();

  // اسم وهاتف وعنوان مطلوبة للتوصيل فقط — استلام من المطعم متاح بلا بيانات
  // اتصال، كما في أضنة: طلب Pickup لا يحتاج معرفة من صاحبه قبل وصوله.
  if (source === 'online' && fulfillment === 'delivery') {
    if (!customerName) throw new HttpError(422, 'NAME_REQUIRED', 'الاسم مطلوب.');
    if (!/^[\d+\-\s()]{7,30}$/.test(phone)) {
      throw new HttpError(422, 'PHONE_REQUIRED', 'رقم هاتف صحيح مطلوب للتواصل بشأن الطلب.');
    }
    if (!address) throw new HttpError(422, 'ADDRESS_REQUIRED', 'العنوان مطلوب للتوصيل.');
  }

  const { lines, total, hasUnpriced } = body.lines
    ? await priceLines(env, restaurant.restaurant_id, body.lines, lang)
    : await priceCartLines(env, restaurant.restaurant_id, body.items, lang);

  const now = Date.now();
  const orderId = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll('-', '');
  const code = orderCode(settings.order_code_prefix);

  const statements = [
    env.DB.prepare(
      `INSERT INTO orders
       (id, restaurant_id, code, token, status, fulfillment, source, customer_name, customer_count,
        table_number, phone, address, notes, cashier_id, total_minor, currency, has_unpriced_lines,
        restaurant_name, restaurant_tagline, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      orderId, restaurant.restaurant_id, code, token, fulfillment, source,
      customerName, Math.max(1, num(body.customer_count) || 1), str(body.table_number, 20),
      phone, address, str(body.notes, 300), cashierId, total, settings.currency || '₪', hasUnpriced,
      // نسخة من الهوية لحظة الطلب: تغيير اسم المطعم لاحقًا لا يعيد كتابة إيصال قديم.
      settings.name_ar || restaurant.name, settings.tagline_ar || '', lang, now, now,
    ),
  ];
  for (const line of lines) {
    statements.push(env.DB.prepare(
      `INSERT INTO order_lines
       (id, restaurant_id, order_id, menu_item_id, offer_id, variant_name_ar, addons_json,
        name_ar, name_en, quantity, unit_price_minor, is_priced, price_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), restaurant.restaurant_id, orderId, line.menu_item_id || null, line.offer_id || null,
      line.variant_name_ar, line.addons_json, line.name_ar, line.name_en,
      line.quantity, line.unit_price_minor, line.is_priced, line.price_note, now,
    ));
  }
  await env.DB.batch(statements);

  return { id: orderId, code, token, total_minor: total, has_unpriced_lines: hasUnpriced, lines };
}

/**
 * يحوّل عربة `main.js` (`{items:[{id, qty, variant_id, addon_ids}]}`) إلى سطور
 * مسعّرة. مطابق لـ`priceLines` في القيود والمنطق، بفارق واحد: يقبل صنفًا
 * بمعرّف `offer-N` فيسعّره من جدول العروض بدل الأصناف — لأن زر «اطلب العرض»
 * في الصفحة المنسوخة عن أضنة يرسل هذا الشكل بالضبط ولن يُعدَّل.
 *
 * عرض بسعر رقمي (`is_priced=1`) يُحسب ويُجمع في الإجمالي كصنف عادي؛ عرض
 * بنص حر («٢ بسعر ١») يُسجَّل بلا سعر ويُعلَّم الطلب بأنه يحتاج تأكيدًا يدويًا
 * — العرض التجاري نفسه لا يزال قرار المطعم لا حسابًا آليًا.
 */
export async function priceCartLines(env, restaurantId, rawItems, lang = 'ar') {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new HttpError(422, 'EMPTY_ORDER', 'السلة فارغة.');
  }
  if (rawItems.length > MAX_LINES) {
    throw new HttpError(422, 'TOO_MANY_LINES', 'عدد الأصناف أكبر من المسموح.');
  }

  const dishLines = [];
  const offerCounts = new Map();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const quantity = num(raw.qty ?? raw.quantity) || 0;
    if (quantity < 1 || quantity > MAX_QUANTITY) continue;
    const rawId = str(raw.id, 120);
    if (rawId.startsWith('offer-')) {
      const offerId = rawId.slice('offer-'.length);
      if (!offerId) continue;
      offerCounts.set(offerId, (offerCounts.get(offerId) || 0) + quantity);
      continue;
    }
    dishLines.push({
      item_id: rawId, quantity,
      variant_id: raw.variant_id != null ? str(raw.variant_id, 120) : undefined,
      addon_ids: Array.isArray(raw.addon_ids) ? raw.addon_ids : [],
    });
  }
  if (!dishLines.length && !offerCounts.size) {
    throw new HttpError(422, 'EMPTY_ORDER', 'لا يوجد صنف صالح في السلة.');
  }

  let lines = [];
  let total = 0;
  let hasUnpriced = 0;

  if (dishLines.length) {
    const priced = await priceLines(env, restaurantId, dishLines, lang);
    lines = priced.lines;
    total += priced.total;
    hasUnpriced = hasUnpriced || priced.hasUnpriced;
  }

  if (offerCounts.size) {
    const offerIds = [...offerCounts.keys()];
    const rows = await env.DB.prepare(
      `SELECT id, title_ar, title_en, price_minor, is_priced, price_text_ar, price_text_en
       FROM offers WHERE restaurant_id = ? AND is_active = 1 AND id IN (${placeholders(offerIds.length)})`,
    ).bind(restaurantId, ...offerIds).all();
    const offersById = new Map(rows.results.map((row) => [row.id, row]));
    for (const [offerId, quantity] of offerCounts) {
      const offer = offersById.get(offerId);
      if (!offer) throw new HttpError(409, 'ITEM_UNAVAILABLE', 'أحد العروض لم يعد متاحًا. حدّث القائمة.');
      const isPriced = Number(offer.is_priced) === 1;
      if (isPriced) total += Number(offer.price_minor) * quantity; else hasUnpriced = 1;
      lines.push({
        offer_id: offer.id,
        name_ar: offer.title_ar, name_en: offer.title_en,
        variant_name_ar: '', addons_json: '[]', quantity,
        unit_price_minor: isPriced ? Number(offer.price_minor) : 0,
        is_priced: isPriced ? 1 : 0,
        price_note: isPriced ? '' : (offer.price_text_ar || (lang === 'en' ? 'Quoted' : 'حسب العرض')),
      });
    }
  }

  return { lines, total, hasUnpriced };
}

/**
 * الطلب العام — عقد `site/js/main.js` حرفيًا: `items`/`qty`، ورد
 * `{code, order_url, whatsapp_url}`.
 *
 * فرق منتجي حقيقي عن أضنة (الذي له باقة واحدة فقط): باقة «المنيو» عندي لا
 * تحفظ طلبات على الخادم إطلاقًا — هذا معناها التجاري. لكن زر الإرسال في
 * `main.js` ينادي هذا المسار دائمًا مهما كانت الباقة، فلا يمكن رفضه بـ402
 * كما تفعل بقية المسارات؛ ذلك يكسر الزر لعملاء الباقة الأرخص. الحل: يُسعَّر
 * الطلب ويُبنى نص واتساب دون أي كتابة في قاعدة البيانات، ويعود بلا `order_url`
 * (لا صفحة طلب لأنه لا سجل أصلًا) — و`main.js` لا يحتاج غير `whatsapp_url`.
 */
export async function publicOrder(request, env, restaurant, settings, body, lang, homeUrl) {
  const ip = request.headers.get('CF-Connecting-IP') || '0';
  await rateLimit(env.DB, `${restaurant.restaurant_id}|ord|${ip}`, 12, 10 * 60e3);

  const fulfillment = body.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const name = str(body.name, 150).trim();
  const phone = str(body.phone, 40).trim();
  const address = str(body.address, 500).trim();

  if (fulfillment === 'delivery') {
    const digits = phone.replace(/\D/g, '');
    if (!name || !address || digits.length < 7 || digits.length > 15) {
      throw new HttpError(400, 'BAD_REQUEST', lang === 'ar'
        ? 'أدخل الاسم ورقم جوال صحيح وعنوان التوصيل.' : 'Enter a name, a valid phone and an address.');
    }
  }

  const waNumber = String(settings.whatsapp_number || '').replace(/\D/g, '');

  if (!planAllows(restaurant.plan_code, 'orders')) {
    const { lines } = await priceCartLines(env, restaurant.restaurant_id, body.items, lang);
    const summary = orderSummaryText(lines, settings.currency || '₪', lang);
    const message = `${lang === 'ar' ? 'طلب جديد' : 'New order'}\n${summary}`
      + (name ? `\n${lang === 'ar' ? 'الاسم' : 'Name'}: ${name}` : '')
      + (phone ? `\n${lang === 'ar' ? 'الهاتف' : 'Phone'}: ${phone}` : '')
      + (address ? `\n${lang === 'ar' ? 'العنوان' : 'Address'}: ${address}` : '');
    return json({
      code: '',
      order_url: '',
      whatsapp_url: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : '',
    }, 201);
  }

  const order = await createOrder(env, restaurant, settings, {
    customer_name: name || (lang === 'ar' ? 'زبون' : 'Guest'),
    phone, address, notes: str(body.notes, 500), fulfillment, items: body.items,
  }, { source: 'online', lang });

  // نسبة إلى جذر موقع المطعم لا إلى مسار هذا الطلب: `request.url` هنا هو
  // `.../order/`، وحلّ عنوان نسبي عليه يضيف `o/{token}/` *داخل* `order/`
  // بدل مساواتها بجذر الموقع — كسر اكتُشف بتجربة طلب حقيقي على الإنتاج.
  const orderUrl = new URL(`o/${order.token}/`, homeUrl).toString();
  const summary = orderSummaryText(order.lines, settings.currency || '₪', lang);
  const message = `${lang === 'ar' ? 'طلب جديد' : 'New order'} ${order.code}\n${summary}\n${orderUrl}`;

  return json({
    code: order.code,
    order_url: orderUrl,
    whatsapp_url: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : '',
  }, 201);
}

/* ==================== الحجوزات ==================== */

const timeToMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

/**
 * الحجز العام — نموذج HTML عادي (`method="post"`) لا JSON، لأن صفحة الحجز
 * المنسوخة عن أضنة نموذج كامل الصفحة. النجاح والفشل يُبلَّغان عبر إعادة
 * توجيه بمعامل استعلام (`?flash=ok_reservation`)، بلا جلسات خادم Django
 * التي لا مقابل لها هنا.
 */
export async function publicReservation(request, env, restaurant, settings, fields, base) {
  const redirect = (flash) => {
    const url = new URL(`${base}#contact`, request.url);
    url.searchParams.set('flash', flash);
    return new Response(null, { status: 303, headers: { Location: url.toString() } });
  };

  if (!planAllows(restaurant.plan_code, 'reservations')) return redirect('err_reservation');

  const ip = request.headers.get('CF-Connecting-IP') || '0';
  try {
    await rateLimit(env.DB, `${restaurant.restaurant_id}|res|${ip}`, 6, 30 * 60e3);
  } catch {
    // علامة مستقلة عن فشل بيانات الحجز: كلاهما يعيد التوجيه لنفس القسم،
    // لكن رسالة «حاول لاحقًا» مختلفة عن «راجع البيانات» في الصفحة.
    return redirect('rl_reservation');
  }

  const fullName = str(fields.get('full_name'), 80).trim();
  const phone = str(fields.get('phone'), 30).trim();
  const date = str(fields.get('date'), 10).trim();
  const time = str(fields.get('time'), 5).trim();
  const guests = num(fields.get('guests'));

  if (!fullName || !/^[\d+\-\s()]{7,30}$/.test(phone) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || guests < 1 || guests > 50) {
    return redirect('err_reservation');
  }

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + Number(settings.max_reservation_days_ahead || 30) * 864e5)
    .toISOString().slice(0, 10);
  if (date < today || date > maxDate) return redirect('err_reservation');

  const minutes = timeToMinutes(time);
  const open = timeToMinutes(settings.reservation_open_time || '12:00');
  const close = timeToMinutes(settings.reservation_close_time || '23:00');
  const slot = Number(settings.reservation_slot_minutes || 30);
  if (minutes < 0 || minutes < open || minutes > close || (slot > 0 && (minutes - open) % slot !== 0)) {
    return redirect('err_reservation');
  }

  // الطاقة الاستيعابية تُقاس على الخادم لحظة الحفظ: حسابها في المتصفح يعني
  // أن حجزين متزامنين يمرّان معًا.
  const taken = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM reservations
     WHERE restaurant_id = ? AND date = ? AND time = ? AND status <> 'cancelled'`,
  ).bind(restaurant.restaurant_id, date, time).first();
  if (Number(taken?.count || 0) >= Number(settings.max_reservations_per_slot || 4)) {
    return redirect('err_reservation');
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO reservations
     (id, restaurant_id, full_name, phone, date, time, guests, occasion, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
  ).bind(
    crypto.randomUUID(), restaurant.restaurant_id, fullName, phone, date, time, guests,
    str(fields.get('occasion'), 60), str(fields.get('notes'), 500), now, now,
  ).run();

  return redirect('ok_reservation');
}

/* ==================== قراءة طلب بالرمز ==================== */

/** الرمز غير قابل للتخمين، فهو مفتاح الطلب. لا جلسة على صفحة يفتحها زبون. */
export async function orderByToken(env, restaurantId, token) {
  const order = await env.DB.prepare(
    'SELECT * FROM orders WHERE restaurant_id = ? AND token = ?',
  ).bind(restaurantId, str(token, 80)).first();
  if (!order) return null;
  const lines = await env.DB.prepare(
    'SELECT * FROM order_lines WHERE restaurant_id = ? AND order_id = ? ORDER BY created_at, id',
  ).bind(restaurantId, order.id).all();
  return { order, lines: lines.results };
}


/**
 * ملخّص الطلب نصًّا لرسالة واتساب — بالأسعار والمجموع.
 *
 * كان النص يحمل الكميات والأسماء وحدها، فيصل المطعمَ طلبٌ بلا أي رقم.
 * في باقة المنيو هذا كل ما يصله أصلًا (لا سجل ولا صفحة طلب)، فكان صاحب
 * المطعم يحسب الفاتورة بيده في كل طلب. الأسعار كانت محسوبة سلفًا ومهملة.
 *
 * سطر بلا سعر رقمي (عرض بنص حر مثل «٢ بسعر ١») يُكتب بنصّه لا بصفر، ويُذيَّل
 * المجموع بتنبيه أنه لا يشمله — المجموع الناقص الصامت أسوأ من غيابه.
 *
 * والحجم والإضافات تُكتَبان في السطر: الرسالة **هي** الطلب كلّه في باقة
 * المنيو، فإن غاب الحجم وصل المطبخ «كباب أضنة» بلا حجم وبسعرٍ يخصّ الكبير،
 * فيُطبخ الوسط ويُختلف على الفرق. والسعر وحده لا يُعلِم الطبّاخ بشيء.
 *
 * واللغة تُحترَم: كان الاسم العربي يُطبع حتى في الرسالة الإنجليزية.
 */
export function orderSummaryText(lines, currency, lang = 'ar') {
  const en = lang === 'en';
  const body = lines.map((line) => {
    const name = (en ? line.name_en || line.name_ar : line.name_ar) || '';
    let addons = [];
    // سطر بإضافات تالفة يُرسَل بلا إضافات بدل أن تسقط الرسالة كلّها.
    try { addons = JSON.parse(line.addons_json || '[]'); } catch { /* تُتجاهَل */ }
    const detail = [
      line.variant_name_ar ? `(${line.variant_name_ar})` : '',
      ...addons.map((addon) => `+ ${(en ? addon.name_en || addon.name_ar : addon.name_ar) || ''}`),
    ].filter(Boolean).join(' ');
    const price = Number(line.is_priced)
      ? money(line.unit_price_minor * line.quantity, currency) : line.price_note;
    return `• ${line.quantity} × ${name}${detail ? ` ${detail}` : ''} — ${price}`;
  }).join('\n');
  const total = lines.reduce((sum, line) =>
    sum + (Number(line.is_priced) ? Number(line.unit_price_minor) * Number(line.quantity) : 0), 0);
  const hasUnpriced = lines.some((line) => !Number(line.is_priced));
  const label = lang === 'ar' ? 'المجموع' : 'Total';
  const note = hasUnpriced
    ? (lang === 'ar' ? ' (عدا ما يُسعَّر عند التأكيد)' : ' (excluding items quoted on confirmation)')
    : '';
  return `${body}\n${label}: ${money(total, currency)}${note}`;
}
