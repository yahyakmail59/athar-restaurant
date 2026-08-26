/**
 * محرك المطاعم — Worker متعدد المستأجرين.
 *
 * أربع مسؤوليات:
 *  1. `/internal/v1/*` — محوّل لوحة أثر، موقّع بـHMAC.
 *  2. `/r/{slug}/*`    — الموقع العام لكل مطعم، مبنيّ على الخادم.
 *  3. `/api/*`         — لوحة المطعم، بجلسة.
 *  4. `/img/*`         — صور المطعم من R2.
 *
 * الفرق عن محركَي الصيدلية والمدرسة: هناك المستأجر يأتي من الجلسة وحدها،
 * وهنا للموقع العام زوّار بلا جلسة، فالمستأجر يأتي من الـslug في المسار.
 * ولذلك كل استعلام عام يمر عبر `resolveRestaurant` أولًا، ولا يوجد مسار عام
 * يقبل معرّف مطعم من جسم الطلب.
 */

import { HttpError, json, str } from './lib.js';
import { handleAdapter } from './adapter.js';
import { loadBestSellers, loadSite, resolveRestaurant } from './site.js';
import {
  choices, ARABIC_FONTS, ARABIC_DISPLAY_FONTS, DISPLAY_FONTS, LATIN_FONTS,
} from './fonts.js';
import { HERO_STAT_LABELS, CATEGORY_LABELS, SERVICE_LABELS } from './icons.js';
import { renderHome, renderMenu, renderOrder, simplePage } from './render.js';
import { orderByToken, publicOrder, publicReservation } from './orders.js';
import { renderReceiptPng } from './receipt.js';
import { serveImage, uploadImage, deleteImage } from './images.js';
import { planAllows } from './access.js';
import {
  cashierOrder, changeOwnCredentials, dashboard, deleteContent, listContent,
  listOrders, listReservations, login, manageUsers, me, requireSession,
  saveContent, setOrderStatus, setReservationStatus, updateSettings,
} from './admin.js';

const html = (markup, status = 200, cache = 'no-store') => new Response(markup, {
  status,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  },
});

const langOf = (url) => (url.searchParams.get('lang') === 'en' ? 'en' : 'ar');

/**
 * نطاقات فرعية لا تخصّ مطعمًا مهما بدت كذلك.
 *
 * `console` للوحة أثر، والبقية أسماء تتوقّعها الأدوات والبريد والشهادات.
 * بلا هذه القائمة يكفي إنشاء مطعم باسم `www` لخطف نطاق عام.
 */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'console', 'panel', 'admin', 'api', 'app', 'mail', 'smtp', 'ftp', 'ns1', 'ns2',
]);

/**
 * اسم المطعم من ترويسة `Host` حين يُخدَم من نطاق أثر.
 *
 * `adana.athar.date` أنظف من `.../r/adana/`، وأصلح لأن يُطبع على لافتة، ويجعل
 * موقع كل مطعم أصلًا مستقلًّا في نظر المتصفح ومحركات البحث.
 *
 * المسار القديم يبقى عاملًا: مطاعم قائمة تعرف رابطها وقد نشرته، وكسره
 * لتحسين في الشكل لا يُقبل.
 */
function tenantFromHost(request, env) {
  const domain = String(env.PUBLIC_SITE_DOMAIN || '').trim().toLowerCase();
  if (!domain) return '';
  const host = String(request.headers.get('Host') || '').toLowerCase().split(':')[0];
  const suffix = `.${domain}`;
  if (!host.endsWith(suffix)) return '';
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.') || RESERVED_SUBDOMAINS.has(label)) return '';
  return /^[a-z0-9-]{1,60}$/.test(label) ? label : '';
}

/**
 * لوحة المطعم على `/admin` فوق نطاق المطعم.
 *
 * الجذر هناك هو موقع الزبون، فاللوحة تحتاج مسارًا خاصًّا بها. يُحذف `/admin`
 * قبل تمرير الطلب إلى الأصول، فتبقى إشارات `index.html` النسبية عاملة سواء
 * فُتح العنوان بشرطة أخيرة أو بدونها.
 */
function servePanel(request, env, path) {
  if (!env.ASSETS) return new Response('Not found', { status: 404 });
  const rewritten = new URL(request.url);
  const rest = path.slice('/admin'.length);
  // `/` لا `/index.html`: طبقة الأصول تُقنّن `/index.html` فتردّ 307 إلى `/`،
  // و`/` على نطاق المطعم هو موقع الزبون — فتنتهي اللوحة بالتحويل إلى الموقع.
  // طلب `/` من الأصول مباشرةً يعيد نفس الملف بلا تحويل، ولا تكرار لأن هذا
  // نداء للأصول لا للـWorker.
  rewritten.pathname = !rest || rest === '/' ? '/' : rest;
  return env.ASSETS.fetch(new Request(rewritten.toString(), request));
}

/* ==================== الموقع العام ==================== */

async function handlePublic(request, env, slug, rest, base) {
  const url = new URL(request.url);
  const restaurant = await resolveRestaurant(env, slug);

  // مطعم غير موجود ومطعم موقوف يعطيان نفس الصفحة عمدًا: حالة الاشتراك
  // شأن تجاري بين أثر وصاحب المطعم، لا إعلان على صفحة يقرؤها زبائنه.
  if (!restaurant || !Number(restaurant.is_active)) {
    return simplePage('الصفحة غير متاحة', 'تعذّر الوصول إلى هذا الموقع حاليًا.', 404);
  }

  const homeUrl = new URL(base, url.origin).toString();
  const lang = langOf(url);

  // مسارات المنيو والطلب والحجز — أسماؤها ومقاييسها مطابقة لأضنة تمامًا
  // (`order/`، `reservation/`، `o/{token}/`) لأن `site/js/main.js` المنسوخ
  // حرفيًا يبني هذه الروابط بنفسه، ولا جلسة على أي منها.
  if (rest === 'order/' && request.method === 'POST') {
    const settings = await env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?')
      .bind(restaurant.restaurant_id).first();
    const body = await request.json().catch(() => {
      throw new HttpError(400, 'INVALID_JSON', 'Request JSON is invalid.');
    });
    return publicOrder(request, env, restaurant, settings, body, lang, homeUrl);
  }
  if (rest === 'reservation/' && request.method === 'POST') {
    const settings = await env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?')
      .bind(restaurant.restaurant_id).first();
    const fields = new URLSearchParams(await request.text());
    return publicReservation(request, env, restaurant, settings, fields, base);
  }

  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  // صفحة الطلب وإيصاله: الرمز هو المفتاح، وهو غير قابل للتخمين.
  const receiptMatch = rest.match(/^o\/([a-zA-Z0-9]+)\/receipt\.png$/);
  if (receiptMatch) {
    if (!planAllows(restaurant.plan_code, 'receipts')) {
      return simplePage('غير متاح', 'الإيصال المصوَّر جزء من الباقة الكاملة.', 402);
    }
    const found = await orderByToken(env, restaurant.restaurant_id, receiptMatch[1]);
    if (!found) return simplePage('الطلب غير موجود', 'تحقق من الرابط.', 404);
    const settings = await env.DB.prepare('SELECT primary_color FROM settings WHERE restaurant_id = ?')
      .bind(restaurant.restaurant_id).first();
    const png = await renderReceiptPng(env, found.order, found.lines, {
      accent: settings?.primary_color || '#E30613',
    });
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        // خاص لا عام: الرابط يحمل بيانات زبون، فلا يُخبَّأ على الحافة.
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${found.order.code}.png"`,
      },
    });
  }

  const orderMatch = rest.match(/^o\/([a-zA-Z0-9]+)\/?$/);
  if (orderMatch) {
    const found = await orderByToken(env, restaurant.restaurant_id, orderMatch[1]);
    if (!found) return simplePage('الطلب غير موجود', 'تحقق من الرابط.', 404);
    const site = await loadSite(env, restaurant.restaurant_id);
    if (!site.settings) return simplePage('الصفحة غير متاحة', 'هذا الموقع قيد الإعداد.', 404);
    const receiptUrl = new URL(`o/${orderMatch[1]}/receipt.png`, homeUrl).toString();
    return html(renderOrder(site, found.order, found.lines, { base, receiptUrl }));
  }

  const site = await loadSite(env, restaurant.restaurant_id);
  if (!site.settings) return simplePage('الصفحة غير متاحة', 'هذا الموقع قيد الإعداد.', 404);

  if (rest === '' || rest === 'index.html') {
    site.bestSellers = await loadBestSellers(env, restaurant.restaurant_id);
    const canonical = new URL(base, url.origin).toString();
    return html(renderHome(site, { lang, base, canonical, homeUrl, slug: restaurant.slug }), 200, 'public, max-age=60');
  }
  if (rest === 'menu/' || rest === 'menu') {
    site.bestSellers = await loadBestSellers(env, restaurant.restaurant_id);
    const activeCategory = str(url.searchParams.get('category') || 'all', 60);
    const canonical = new URL(`${base}menu/`, url.origin).toString();
    return html(renderMenu(site, { lang, base, canonical, activeCategory, slug: restaurant.slug }), 200, 'public, max-age=60');
  }
  return simplePage('الصفحة غير موجودة', 'تحقق من الرابط.', 404);
}

/* ==================== لوحة المطعم ==================== */

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health' && method === 'GET') {
    return json({ ok: true, service: 'athar-restaurant', version: '1.0.0' });
  }
  // قوائم الخطوط والأيقونات المعتمدة — تبني منها لوحة المطعم قوائم اختيار،
  // فلا يكتب أحد اسم خط أو أيقونة بيده. بلا جلسة: نص ثابت لا يخص مستأجرًا.
  if (path === '/api/meta' && method === 'GET') {
    return json({
      fonts: {
        arabic: choices(ARABIC_FONTS), arabic_display: choices(ARABIC_DISPLAY_FONTS),
        display: choices(DISPLAY_FONTS), latin: choices(LATIN_FONTS),
      },
      icons: {
        hero_stats: Object.entries(HERO_STAT_LABELS),
        categories: Object.entries(CATEGORY_LABELS),
        services: Object.entries(SERVICE_LABELS),
      },
    });
  }
  if (path === '/api/login' && method === 'POST') return login(request, env);

  const session = await requireSession(request, env);

  if (path === '/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.token_hash).run();
    return json({ ok: true });
  }
  if (path === '/api/me' && method === 'GET') return me(env, session);
  if (path === '/api/settings' && method === 'POST') return updateSettings(request, env, session);
  if (path === '/api/account/credentials' && method === 'POST') {
    return changeOwnCredentials(request, env, session);
  }

  const contentList = path.match(/^\/api\/content\/([a-z_]+)$/);
  if (contentList && method === 'GET') return listContent(env, session, contentList[1]);
  if (contentList && method === 'POST') return saveContent(request, env, session, contentList[1], '');

  const contentRow = path.match(/^\/api\/content\/([a-z_]+)\/([^/]+)$/);
  if (contentRow && method === 'POST') {
    return saveContent(request, env, session, contentRow[1], decodeURIComponent(contentRow[2]));
  }
  if (contentRow && method === 'DELETE') {
    return deleteContent(env, session, contentRow[1], decodeURIComponent(contentRow[2]));
  }

  if (path === '/api/orders' && method === 'GET') return listOrders(request, env, session);
  if (path === '/api/orders' && method === 'POST') return cashierOrder(request, env, session);
  const orderStatus = path.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (orderStatus && method === 'POST') {
    return setOrderStatus(request, env, session, decodeURIComponent(orderStatus[1]));
  }

  if (path === '/api/reservations' && method === 'GET') return listReservations(request, env, session);
  const reservationStatus = path.match(/^\/api\/reservations\/([^/]+)\/status$/);
  if (reservationStatus && method === 'POST') {
    return setReservationStatus(request, env, session, decodeURIComponent(reservationStatus[1]));
  }

  if (path === '/api/dashboard' && method === 'GET') return dashboard(env, session);

  if (path === '/api/users' && (method === 'GET' || method === 'POST')) {
    return manageUsers(request, env, session, method, '');
  }
  const userRow = path.match(/^\/api\/users\/([^/]+)$/);
  if (userRow && method === 'PATCH') {
    return manageUsers(request, env, session, 'PATCH', decodeURIComponent(userRow[1]));
  }

  if (path === '/api/upload' && method === 'POST') return uploadImage(request, env, session);
  const imageRow = path.match(/^\/api\/upload\/(.+)$/);
  if (imageRow && method === 'DELETE') {
    return deleteImage(env, session, decodeURIComponent(imageRow[1]));
  }

  throw new HttpError(404, 'NOT_FOUND', 'Route was not found.');
}

/* ==================== المدخل ==================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/internal/v1/')) return handleAdapter(request, env);

    try {
      if (path.startsWith('/img/')) return await serveImage(env, path);
      if (path.startsWith('/api/')) return await handleApi(request, env);

      // نطاق المطعم: الجذر موقعه، و`/admin` لوحته، و`/site/` الأصول المشتركة.
      const tenantSlug = tenantFromHost(request, env);
      if (tenantSlug) {
        if (path === '/admin' || path.startsWith('/admin/')) return servePanel(request, env, path);
        if (path.startsWith('/site/')) {
          return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
        }
        return await handlePublic(request, env, tenantSlug, str(path.replace(/^\//, ''), 200), '/');
      }

      const publicMatch = path.match(/^\/r\/([a-z0-9-]{1,60})\/?(.*)$/);
      if (publicMatch) {
        return await handlePublic(request, env, publicMatch[1], str(publicMatch[2], 200),
          `/r/${publicMatch[1]}/`);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        // صفحات تُعرَض بالمتصفح (GET) تحصل على صفحة عذر بالعربية؛ نداءات
        // API — بما فيها `order/` العام الذي ينادیه `main.js` بجسم JSON —
        // تحتاج ردًّا JSON يقرأه الكود لا نصًّا يُبنى داخل صفحة كاملة.
        const wantsHtml = request.method === 'GET' && !path.startsWith('/api/');
        if (wantsHtml) return simplePage('تعذّر إتمام الطلب', error.message, error.status);
        return json({ ok: false, error: error.code, message: error.message }, error.status);
      }
      console.error(JSON.stringify({
        event: 'request.error',
        path,
        error_name: error instanceof Error ? error.name : 'UnknownError',
        error_message: String(error instanceof Error ? error.message : error).slice(0, 300),
      }));
      return json({ ok: false, error: 'SERVER_ERROR', message: 'Unexpected failure.' }, 500);
    }

    // كل ما تبقّى هو لوحة المطعم الساكنة، مخدومة من نفس الأصل فلا CORS.
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
