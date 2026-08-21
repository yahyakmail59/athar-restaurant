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
import { loadSite, resolveRestaurant } from './site.js';
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

/* ==================== الموقع العام ==================== */

async function handlePublic(request, env, slug, rest) {
  const url = new URL(request.url);
  const restaurant = await resolveRestaurant(env, slug);

  // مطعم غير موجود ومطعم موقوف يعطيان نفس الصفحة عمدًا: حالة الاشتراك
  // شأن تجاري بين أثر وصاحب المطعم، لا إعلان على صفحة يقرؤها زبائنه.
  if (!restaurant || !Number(restaurant.is_active)) {
    return simplePage('الصفحة غير متاحة', 'تعذّر الوصول إلى هذا الموقع حاليًا.', 404);
  }

  const base = `/r/${restaurant.slug}/`;
  const lang = langOf(url);
  const planFull = planAllows(restaurant.plan_code, 'orders');

  // مسارات JSON العامة: الحجز والطلب. لا جلسة، والمستأجر من المسار.
  if (rest === 'api/reservations' && request.method === 'POST') {
    const settings = await env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?')
      .bind(restaurant.restaurant_id).first();
    const body = await request.json().catch(() => {
      throw new HttpError(400, 'INVALID_JSON', 'Request JSON is invalid.');
    });
    return publicReservation(request, env, restaurant, settings, body);
  }
  if (rest === 'api/orders' && request.method === 'POST') {
    const settings = await env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?')
      .bind(restaurant.restaurant_id).first();
    const body = await request.json().catch(() => {
      throw new HttpError(400, 'INVALID_JSON', 'Request JSON is invalid.');
    });
    return publicOrder(request, env, restaurant, settings, body, lang);
  }

  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  // صفحة الطلب وإيصاله: الرمز هو المفتاح، وهو غير قابل للتخمين.
  const receiptMatch = rest.match(/^order\/([a-zA-Z0-9]+)\/receipt\.png$/);
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

  const orderMatch = rest.match(/^order\/([a-zA-Z0-9]+)\/?$/);
  if (orderMatch) {
    const found = await orderByToken(env, restaurant.restaurant_id, orderMatch[1]);
    if (!found) return simplePage('الطلب غير موجود', 'تحقق من الرابط.', 404);
    const site = await loadSite(env, restaurant.restaurant_id);
    if (!site.settings) return simplePage('الصفحة غير متاحة', 'هذا الموقع قيد الإعداد.', 404);
    return html(renderOrder(site, found.order, found.lines, { lang, base, planFull }));
  }

  const site = await loadSite(env, restaurant.restaurant_id);
  if (!site.settings) return simplePage('الصفحة غير متاحة', 'هذا الموقع قيد الإعداد.', 404);

  const canonical = new URL(base + (rest === 'menu' ? 'menu' : ''), url.origin).toString();

  if (rest === '' || rest === 'index.html') {
    return html(renderHome(site, { lang, base, planFull, canonical }), 200, 'public, max-age=60');
  }
  if (rest === 'menu' || rest === 'menu/') {
    return html(renderMenu(site, { lang, base, planFull, canonical }), 200, 'public, max-age=60');
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

      const publicMatch = path.match(/^\/r\/([a-z0-9-]{1,60})\/?(.*)$/);
      if (publicMatch) {
        return await handlePublic(request, env, publicMatch[1], str(publicMatch[2], 200));
      }

      if (path.startsWith('/api/')) return await handleApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        const wantsHtml = !path.startsWith('/api/') && !path.includes('/api/');
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
