/**
 * لوحة المطعم: الجلسات، المحتوى، الطلبات، الحجوزات، التقارير، الحسابات.
 *
 * `restaurant_id` من الجلسة دائمًا. لا مسار هنا يقرأ المطعم من جسم الطلب،
 * فلا يستطيع كاشير أن يقرأ طلبات مطعم آخر مهما عدّل ما يرسله.
 */

import {
  HttpError, PBKDF2_ITER, SESSION_TTL_MS, checkLock, clearFails, derivePassword,
  json, newSalt, newToken, noteFail, num, readJson, safeColor, safeEqual,
  sha256b64, str,
} from './lib.js';
import {
  ATHAR_OWNED_SETTINGS, ROLES, canWriteSection, isKnownSection, planAllows, stripAtharOwned,
} from './access.js';
import { createOrder } from './orders.js';
import {
  ARABIC_FONTS, ARABIC_DISPLAY_FONTS, DISPLAY_FONTS, LATIN_FONTS,
} from './fonts.js';
import { HERO_STAT_ICONS, CATEGORY_ICONS, SERVICE_ICONS } from './icons.js';

/* ==================== الجلسات ==================== */

export async function requireSession(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
  const hash = await sha256b64(token);
  const session = await env.DB.prepare(
    `SELECT s.restaurant_id, s.user_id, s.role, s.expires_at,
            r.plan_code, r.is_active, r.lifecycle_status, r.name, r.slug, r.environment
     FROM sessions s JOIN restaurants r ON r.restaurant_id = s.restaurant_id
     WHERE s.token_hash = ?`,
  ).bind(hash).first();
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Session is invalid.');
  if (Number(session.expires_at) < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    throw new HttpError(401, 'SESSION_EXPIRED', 'Session has expired.');
  }
  if (!Number(session.is_active)) {
    throw new HttpError(403, 'SUBSCRIPTION_SUSPENDED', 'هذا الاشتراك موقوف حاليًا.');
  }
  return { ...session, token_hash: hash };
}

export async function login(request, env) {
  const body = await readJson(request, 4096);
  const restaurantId = str(body.restaurant_id, 80).trim().toUpperCase();
  const username = str(body.username, 60).trim().toLowerCase();
  const password = str(body.password, 200);
  if (!restaurantId || !username || !password) {
    throw new HttpError(400, 'BAD_REQUEST', 'معرّف المطعم واسم المستخدم وكلمة المرور مطلوبة.');
  }

  const ip = request.headers.get('CF-Connecting-IP') || '0';
  const lockKey = `${restaurantId}|${username}|${ip}`;
  const locked = await checkLock(env.DB, lockKey);
  if (locked) throw new HttpError(429, 'LOCKED', `محاولات كثيرة. أعد المحاولة بعد ${locked} ثانية.`);

  // يُقبل معرّف المطعم أو الـslug الظاهر في رابط الموقع.
  //
  // زر «الإدارة» في تذييل الموقع يمرّر الـslug: هو معرّف الموقع الظاهر أصلًا
  // في عنوان كل صفحة، فلا يضيف تمريره شيئًا. ولا يُبنى على هذا وهمُ حماية:
  // `sid()` تحشر `restaurant_id` داخل معرّف كل صنف، فهو منشور في الصفحة
  // العامة عشرات المرات سلفًا. الحماية الحقيقية كلمة المرور والقفل بعد
  // المحاولات، لا سرّية المعرّف.
  const restaurant = await env.DB.prepare(
    `SELECT restaurant_id, is_active, plan_code, environment, name, slug FROM restaurants
     WHERE restaurant_id = ? OR slug = ?`,
  ).bind(restaurantId, restaurantId.toLowerCase()).first();
  if (!restaurant) {
    await noteFail(env.DB, lockKey);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة.');
  }
  if (!Number(restaurant.is_active)) {
    throw new HttpError(403, 'SUBSCRIPTION_SUSPENDED', 'هذا الاشتراك موقوف حاليًا.');
  }

  const user = await env.DB.prepare(
    `SELECT id, username, display_name, role, password_hash, password_salt, password_iterations
     FROM users WHERE restaurant_id = ? AND username = ? AND is_active = 1`,
  ).bind(restaurant.restaurant_id, username).first();
  if (!user) {
    await noteFail(env.DB, lockKey);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة.');
  }
  const derived = await derivePassword(password, user.password_salt, Number(user.password_iterations) || PBKDF2_ITER);
  if (!safeEqual(derived, user.password_hash)) {
    await noteFail(env.DB, lockKey);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة.');
  }
  await clearFails(env.DB, lockKey);

  const token = newToken();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, restaurant_id, user_id, role, device_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(await sha256b64(token), restaurant.restaurant_id, user.id, user.role,
    str(body.device_id, 60), now, now + SESSION_TTL_MS).run();

  return json({
    ok: true,
    token,
    expires_at: now + SESSION_TTL_MS,
    restaurant: {
      id: restaurant.restaurant_id, name: restaurant.name, slug: restaurant.slug,
      plan_code: restaurant.plan_code, environment: restaurant.environment,
    },
    user: { id: user.id, username: user.username, name: user.display_name, role: user.role },
  });
}

export async function me(env, session) {
  const settings = await env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?')
    .bind(session.restaurant_id).first();
  const user = await env.DB.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?')
    .bind(session.user_id).first();
  return json({
    ok: true,
    restaurant: {
      id: session.restaurant_id, name: session.name, slug: session.slug,
      plan_code: session.plan_code, environment: session.environment,
      // مطلق حين يوجد نطاق: اللوحة تبني عليه روابط الإيصال والمتابعة، وهي
      // تُفتح من `/admin` على نطاق المطعم حيث `/r/{slug}/` لا وجود له.
      public_url: env.PUBLIC_SITE_DOMAIN
        ? `https://${session.slug}.${String(env.PUBLIC_SITE_DOMAIN).toLowerCase()}/`
        : `/r/${session.slug}/`,
    },
    user,
    settings: settings || {},
    // الميزات تُحسب على الخادم وتُرسل للواجهة لتخفي ما لا يعمل. الإخفاء
    // راحة للمستخدم لا حماية: كل مسار يفحص الباقة بنفسه أيضًا.
    features: {
      orders: planAllows(session.plan_code, 'orders'),
      reservations: planAllows(session.plan_code, 'reservations'),
      cashier: planAllows(session.plan_code, 'cashier'),
      dashboard: planAllows(session.plan_code, 'dashboard'),
      receipts: planAllows(session.plan_code, 'receipts'),
    },
  });
}

const audit = (env, session, action, entity, entityId, detail = '') => env.DB.prepare(
  `INSERT INTO restaurant_audit (id, restaurant_id, at, user_id, action, entity, entity_id, detail)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
).bind(crypto.randomUUID(), session.restaurant_id, Date.now(), session.user_id,
  action, entity, entityId, str(detail, 300));

/* ==================== الإعدادات ==================== */

let settingsColumnCache = null;

/**
 * أعمدة `settings` القابلة للتعديل، مقروءة من المخطط لا مكتوبة بيدي.
 *
 * القائمة اليدوية تتخلّف عن المخطط: يُضاف حقل ثم يبقى غير قابل للتعديل بلا
 * سبب ظاهر. المقابل أن عمودًا حسّاسًا يُضاف مستقبلًا يصير قابلًا للكتابة،
 * ولذلك قائمة المنع صريحة ويحرسها اختبار.
 */
// قائمة واحدة لا اثنتان. كانت الحقول المملوكة لأثر مكتوبة هنا وفي
// `ATHAR_OWNED_SETTINGS` معًا، فحذف الحماية من أحدهما لم يكسر شيئًا لأن
// الآخر يغطّيه — وهذا يعني أن أيًّا منهما ليس المرجع، وأن حذفهما معًا
// يمر بلا أثر ظاهر. المرجع الآن `access.js` وحده.
const DENIED_SETTINGS = new Set(['restaurant_id', 'updated_at', ...ATHAR_OWNED_SETTINGS]);

// النصّ والخافت والحدود منها: الهوية تملك وضعها لا لونها وحده، وصاحب
// المطعم الذي يبدّل أرضيته إلى فاتحة يحتاج أن يبدّل نصّه معها.
const COLOR_FIELDS = new Set(['primary_color', 'gold_color', 'background_color',
  'surface_color', 'whatsapp_color', 'text_color', 'muted_color']);
// كل خانة خط تتحقق من سجلها الخاص في `fonts.js` — لا نص حر. اسم خط غير
// موجود في السجل لا يكسر شيئًا بنفسه (تسقط الصفحة على الافتراضي)، لكنه
// يعني أن المطعم اختار من قائمة لا وجود لها فعلًا، وهذا ما يمنعه التحقق هنا.
const FONT_FIELDS = {
  arabic_font: ARABIC_FONTS, arabic_display_font: ARABIC_DISPLAY_FONTS,
  display_font: DISPLAY_FONTS, latin_font: LATIN_FONTS,
};
// الأيقونات الرمزية للأقسام والخدمات وأرقام الواجهة، من `icons.js` حصرًا.
const ICON_FIELD_TABLES = { hero_stats: HERO_STAT_ICONS, categories: CATEGORY_ICONS, services: SERVICE_ICONS };
const INT_FIELDS = new Set([
  'show_about', 'show_categories', 'show_featured', 'show_offers', 'show_services',
  'show_reviews', 'show_reservation', 'show_faq', 'show_social',
  'reservation_slot_minutes', 'max_reservations_per_slot', 'max_reservation_days_ahead',
]);

async function settingsColumns(env) {
  if (settingsColumnCache) return settingsColumnCache;
  const info = await env.DB.prepare('PRAGMA table_info(settings)').all();
  settingsColumnCache = new Set(info.results
    .map((row) => String(row.name))
    .filter((name) => !DENIED_SETTINGS.has(name)));
  return settingsColumnCache;
}

export async function updateSettings(request, env, session) {
  if (!canWriteSection(session.role, 'settings')) {
    throw new HttpError(403, 'FORBIDDEN', 'تعديل الإعدادات للمالك والمدير.');
  }
  const allowed = await settingsColumns(env);
  // الاسم والباقة يملكهما لوحة أثر. الإخفاء من الواجهة ليس منعًا، فالتجريد
  // يحدث هنا مهما أُرسل.
  const patch = stripAtharOwned(await readJson(request));

  const sets = [];
  const values = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    let value;
    if (COLOR_FIELDS.has(key)) {
      value = safeColor(raw, '');
      if (!value) throw new HttpError(422, 'INVALID_COLOR', `اللون غير صالح: ${key}`);
    } else if (FONT_FIELDS[key]) {
      value = str(raw, 40);
      if (!Object.hasOwn(FONT_FIELDS[key], value)) {
        throw new HttpError(422, 'INVALID_FONT', `اختر خطًّا من القائمة: ${key}`);
      }
    } else if (key === 'theme') {
      // `theme` عمود قديم لا يقرؤه المولّد إطلاقًا: التصميم الأساسي المنسوخ
      // عن أضنة داكن في بنيته (نص أبيض وظلال داكنة مكتوبة صراحة، لا متغيّرات)،
      // فلا وجود لنمط فاتح يُشتغَّل بقيمة. قبوله صامتًا يعني وعدًا كاذبًا،
      // فيُرفض حتى يُبنى النمط الفاتح فعلًا.
      throw new HttpError(422, 'THEME_NOT_SETTABLE', 'النمط الفاتح غير مبنيّ بعد؛ استعمل «طبقة الثيم» والألوان.');
    } else if (key === 'theme_layer') {
      // طبقة واحدة موجودة فعلًا (`luxury`). قيمة أخرى تشير إلى ملف CSS غير
      // مبنيّ بعد، فتُرفض بدل أن تُحقن رابطًا لا يردّ عليه شيء.
      value = str(raw, 20);
      if (value && value !== 'luxury') {
        throw new HttpError(422, 'INVALID_THEME_LAYER', 'طبقة الثيم غير متاحة.');
      }
    } else if (key === 'reservation_open_time' || key === 'reservation_close_time') {
      value = str(raw, 5);
      if (!/^\d{2}:\d{2}$/.test(value)) throw new HttpError(422, 'INVALID_TIME', 'الوقت بصيغة HH:MM.');
    } else if (INT_FIELDS.has(key)) {
      value = Math.max(0, num(raw));
    } else {
      value = str(raw, 2000);
    }
    sets.push(`${key} = ?`);
    values.push(value);
  }
  if (!sets.length) throw new HttpError(422, 'NOTHING_TO_CHANGE', 'لم تُرسل حقولًا قابلة للتعديل.');

  await env.DB.batch([
    env.DB.prepare(`UPDATE settings SET ${sets.join(', ')}, updated_at = ? WHERE restaurant_id = ?`)
      .bind(...values, Date.now(), session.restaurant_id),
    audit(env, session, 'SETTINGS_UPDATED', 'settings', session.restaurant_id, Object.keys(patch).join(',')),
  ]);
  return json({ ok: true, updated: sets.length });
}

/* ==================== المحتوى ==================== */

/**
 * كل قسم وجدوله وأعمدته المسموح بكتابتها.
 *
 * الأعمدة مذكورة صراحةً هنا لا مأخوذة من الطلب: بدون قائمة، جسم طلب فيه
 * `restaurant_id` ينقل صنفًا إلى مطعم آخر.
 */
const SECTIONS = {
  hero_stats: { table: 'hero_stats', columns: ['title_ar', 'title_en', 'icon', 'display_order', 'is_active'] },
  categories: {
    table: 'categories',
    columns: ['name_ar', 'name_en', 'slug', 'icon', 'image_url', 'display_order', 'is_active'],
  },
  menu_items: {
    table: 'menu_items',
    columns: ['category_id', 'name_ar', 'name_en', 'description_ar', 'description_en',
      'price_minor', 'old_price_minor', 'is_priced', 'image_url', 'badge_ar', 'badge_en',
      'is_featured', 'is_available', 'display_order'],
    parents: { category_id: 'categories' },
  },
  variants: {
    table: 'menu_item_variants',
    columns: ['menu_item_id', 'name_ar', 'name_en', 'price_minor', 'display_order', 'is_active'],
    parents: { menu_item_id: 'menu_items' },
  },
  addons: {
    table: 'menu_item_addons',
    columns: ['menu_item_id', 'name_ar', 'name_en', 'price_minor', 'display_order', 'is_active'],
    parents: { menu_item_id: 'menu_items' },
  },
  offers: {
    table: 'offers',
    columns: ['title_ar', 'title_en', 'description_ar', 'description_en', 'price_text_ar',
      'price_text_en', 'old_price_text_ar', 'old_price_text_en', 'price_minor', 'is_priced',
      'image_url', 'display_order', 'is_active'],
  },
  services: {
    table: 'services',
    columns: ['title_ar', 'title_en', 'description_ar', 'description_en', 'icon', 'display_order', 'is_active'],
  },
  testimonials: {
    table: 'testimonials',
    columns: ['customer_name', 'review_ar', 'review_en', 'rating', 'avatar_url', 'display_order', 'is_active'],
  },
  faqs: {
    table: 'faqs',
    columns: ['question_ar', 'question_en', 'answer_ar', 'answer_en', 'display_order', 'is_active'],
  },
  social_posts: {
    table: 'social_posts',
    columns: ['title', 'image_url', 'post_url', 'display_order', 'is_active'],
  },
};

const CONTENT_INT_FIELDS = new Set([
  'price_minor', 'old_price_minor', 'is_priced', 'is_featured', 'is_available',
  'is_active', 'display_order', 'rating',
]);

export const contentSections = () => Object.keys(SECTIONS);

export async function listContent(env, session, section) {
  const config = SECTIONS[section];
  if (!config) throw new HttpError(404, 'UNKNOWN_SECTION', 'قسم غير معروف.');
  const rows = await env.DB.prepare(
    `SELECT * FROM ${config.table} WHERE restaurant_id = ? ORDER BY display_order, id`,
  ).bind(session.restaurant_id).all();
  return json({ ok: true, section, rows: rows.results });
}

export async function saveContent(request, env, session, section, idFromPath) {
  const config = SECTIONS[section];
  if (!config || !isKnownSection(section)) throw new HttpError(404, 'UNKNOWN_SECTION', 'قسم غير معروف.');
  if (!canWriteSection(session.role, section)) {
    throw new HttpError(403, 'FORBIDDEN', 'دورك لا يسمح بتعديل هذا القسم.');
  }
  const body = await readJson(request);

  const values = {};
  for (const column of config.columns) {
    if (!Object.hasOwn(body, column)) continue;
    if (column === 'icon' && ICON_FIELD_TABLES[section]) {
      // أيقونة رمزية من `icons.js` لا نص حر: قيمة مجهولة تسقط بأمان عند
      // العرض، فيبدو القسم بلا أيقونة مميّزة بلا سبب ظاهر لمن اختارها.
      const value = str(body.icon, 20);
      if (value && !Object.hasOwn(ICON_FIELD_TABLES[section], value)) {
        throw new HttpError(422, 'INVALID_ICON', 'اختر أيقونة من القائمة.');
      }
      values.icon = value;
      continue;
    }
    values[column] = CONTENT_INT_FIELDS.has(column)
      ? Math.max(0, num(body[column]))
      : str(body[column], 2000);
  }

  // المرجع يجب أن يخص هذا المطعم. بدون الفحص يُسند صنف إلى قسم مطعم آخر،
  // فيظهر في قائمة لا يملكها صاحبه.
  for (const [column, parentSection] of Object.entries(config.parents || {})) {
    if (values[column] === undefined) continue;
    const parent = SECTIONS[parentSection];
    const found = await env.DB.prepare(
      `SELECT id FROM ${parent.table} WHERE id = ? AND restaurant_id = ?`,
    ).bind(values[column], session.restaurant_id).first();
    if (!found) throw new HttpError(422, 'INVALID_PARENT', 'المرجع المختار غير موجود في هذا المطعم.');
  }

  const now = Date.now();
  const id = str(idFromPath || body.id, 120);

  if (id) {
    const existing = await env.DB.prepare(
      `SELECT id FROM ${config.table} WHERE id = ? AND restaurant_id = ?`,
    ).bind(id, session.restaurant_id).first();
    if (!existing) throw new HttpError(404, 'ROW_NOT_FOUND', 'العنصر غير موجود.');
    const keys = Object.keys(values);
    if (!keys.length) throw new HttpError(422, 'NOTHING_TO_CHANGE', 'لم تغيّر شيئًا.');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE ${config.table} SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = ?
         WHERE id = ? AND restaurant_id = ?`,
      ).bind(...keys.map((key) => values[key]), now, id, session.restaurant_id),
      audit(env, session, 'CONTENT_UPDATED', section, id, keys.join(',')),
    ]);
    return json({ ok: true, id });
  }

  const newId = crypto.randomUUID();
  const keys = Object.keys(values);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ${config.table} (id, restaurant_id, ${keys.join(', ')}, updated_at)
       VALUES (?, ?, ${keys.map(() => '?').join(', ')}, ?)`,
    ).bind(newId, session.restaurant_id, ...keys.map((key) => values[key]), now),
    audit(env, session, 'CONTENT_CREATED', section, newId, ''),
  ]);
  return json({ ok: true, id: newId }, 201);
}

export async function deleteContent(env, session, section, id) {
  const config = SECTIONS[section];
  if (!config) throw new HttpError(404, 'UNKNOWN_SECTION', 'قسم غير معروف.');
  if (!canWriteSection(session.role, section)) {
    throw new HttpError(403, 'FORBIDDEN', 'دورك لا يسمح بحذف هذا العنصر.');
  }
  const statements = [
    env.DB.prepare(`DELETE FROM ${config.table} WHERE id = ? AND restaurant_id = ?`)
      .bind(str(id, 120), session.restaurant_id),
  ];
  // حذف صنف يأخذ أحجامه وإضافاته معه: تركها يترك صفوفًا لا يصلها أحد.
  if (section === 'menu_items') {
    statements.push(
      env.DB.prepare('DELETE FROM menu_item_variants WHERE menu_item_id = ? AND restaurant_id = ?')
        .bind(str(id, 120), session.restaurant_id),
      env.DB.prepare('DELETE FROM menu_item_addons WHERE menu_item_id = ? AND restaurant_id = ?')
        .bind(str(id, 120), session.restaurant_id),
    );
  }
  statements.push(audit(env, session, 'CONTENT_DELETED', section, str(id, 120)));
  await env.DB.batch(statements);
  return json({ ok: true });
}

/* ==================== الطلبات ==================== */

const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'delivered', 'cancelled'];

export async function listOrders(request, env, session) {
  if (!planAllows(session.plan_code, 'orders')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'الطلبات جزء من الباقة الكاملة.');
  }
  const url = new URL(request.url);
  const status = str(url.searchParams.get('status'), 20);
  const limit = Math.min(Math.max(num(url.searchParams.get('limit')) || 50, 1), 200);
  const filtered = ORDER_STATUSES.includes(status);

  const orders = await env.DB.prepare(
    `SELECT * FROM orders WHERE restaurant_id = ?${filtered ? ' AND status = ?' : ''}
     ORDER BY created_at DESC LIMIT ?`,
  ).bind(...(filtered ? [session.restaurant_id, status, limit] : [session.restaurant_id, limit])).all();

  if (!orders.results.length) return json({ ok: true, orders: [] });

  const ids = orders.results.map((order) => order.id);
  const lines = await env.DB.prepare(
    `SELECT * FROM order_lines WHERE restaurant_id = ? AND order_id IN (${ids.map(() => '?').join(', ')})`,
  ).bind(session.restaurant_id, ...ids).all();

  const grouped = new Map(ids.map((id) => [id, []]));
  for (const line of lines.results) grouped.get(line.order_id)?.push(line);

  return json({
    ok: true,
    orders: orders.results.map((order) => ({ ...order, lines: grouped.get(order.id) || [] })),
  });
}

export async function setOrderStatus(request, env, session, orderId) {
  if (!planAllows(session.plan_code, 'orders')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'الطلبات جزء من الباقة الكاملة.');
  }
  if (!canWriteSection(session.role, 'orders')) {
    throw new HttpError(403, 'FORBIDDEN', 'دورك لا يسمح بتغيير حالة الطلب.');
  }
  const body = await readJson(request, 4096);
  const status = str(body.status, 20);
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(422, 'INVALID_STATUS', 'حالة غير معروفة.');

  const existing = await env.DB.prepare(
    'SELECT id, status FROM orders WHERE id = ? AND restaurant_id = ?',
  ).bind(str(orderId, 120), session.restaurant_id).first();
  if (!existing) throw new HttpError(404, 'ORDER_NOT_FOUND', 'الطلب غير موجود.');

  await env.DB.batch([
    env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?')
      .bind(status, Date.now(), existing.id, session.restaurant_id),
    audit(env, session, 'ORDER_STATUS', 'order', existing.id, `${existing.status}→${status}`),
  ]);
  return json({ ok: true, status });
}

/** طلب من الكاشير: نفس التسعير الخادمي، ومصدر مختلف حتى تفرّقهما التقارير. */
export async function cashierOrder(request, env, session) {
  if (!planAllows(session.plan_code, 'cashier')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'الكاشير جزء من الباقة الكاملة.');
  }
  if (!canWriteSection(session.role, 'orders')) {
    throw new HttpError(403, 'FORBIDDEN', 'دورك لا يسمح بإنشاء طلب.');
  }
  const settings = await env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?')
    .bind(session.restaurant_id).first();
  const restaurant = {
    restaurant_id: session.restaurant_id, plan_code: session.plan_code, name: session.name,
  };
  const body = await readJson(request);
  const order = await createOrder(env, restaurant, settings, body, {
    source: 'cashier', cashierId: session.user_id,
  });
  await audit(env, session, 'ORDER_CREATED', 'order', order.id, order.code).run();
  return json({ ok: true, ...order }, 201);
}

/* ==================== الحجوزات ==================== */

const RESERVATION_STATUSES = ['new', 'contacted', 'confirmed', 'cancelled'];

export async function listReservations(request, env, session) {
  if (!planAllows(session.plan_code, 'reservations')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'الحجوزات جزء من الباقة الكاملة.');
  }
  const url = new URL(request.url);
  const limit = Math.min(Math.max(num(url.searchParams.get('limit')) || 100, 1), 300);
  const rows = await env.DB.prepare(
    'SELECT * FROM reservations WHERE restaurant_id = ? ORDER BY date, time LIMIT ?',
  ).bind(session.restaurant_id, limit).all();
  return json({ ok: true, reservations: rows.results });
}

export async function setReservationStatus(request, env, session, reservationId) {
  if (!planAllows(session.plan_code, 'reservations')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'الحجوزات جزء من الباقة الكاملة.');
  }
  if (!canWriteSection(session.role, 'reservations')) {
    throw new HttpError(403, 'FORBIDDEN', 'دورك لا يسمح بتغيير الحجز.');
  }
  const body = await readJson(request, 4096);
  const status = str(body.status, 20);
  if (!RESERVATION_STATUSES.includes(status)) throw new HttpError(422, 'INVALID_STATUS', 'حالة غير معروفة.');
  const existing = await env.DB.prepare(
    'SELECT id FROM reservations WHERE id = ? AND restaurant_id = ?',
  ).bind(str(reservationId, 120), session.restaurant_id).first();
  if (!existing) throw new HttpError(404, 'RESERVATION_NOT_FOUND', 'الحجز غير موجود.');
  await env.DB.batch([
    env.DB.prepare('UPDATE reservations SET status = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?')
      .bind(status, Date.now(), existing.id, session.restaurant_id),
    audit(env, session, 'RESERVATION_STATUS', 'reservation', existing.id, status),
  ]);
  return json({ ok: true, status });
}

/* ==================== لوحة التشغيل ==================== */

/**
 * أرقام اليوم والأسبوع.
 *
 * الطلبات الملغاة مستبعدة من الإيراد ومحسوبة في عدد منفصل: مطعم يرى إيرادًا
 * يشمل ما أُلغي يخطّط على رقم لم يدخل صندوقه.
 */
export async function dashboard(env, session) {
  if (!planAllows(session.plan_code, 'dashboard')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'لوحة التشغيل جزء من الباقة الكاملة.');
  }
  const now = Date.now();
  const startOfDay = new Date(new Date(now).toISOString().slice(0, 10)).getTime();
  const weekAgo = now - 7 * 864e5;
  const db = env.DB;

  const [today, week, byStatus, topItems, reservations] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_minor), 0) AS revenue
       FROM orders WHERE restaurant_id = ? AND created_at >= ? AND status <> 'cancelled'`,
    ).bind(session.restaurant_id, startOfDay),
    db.prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_minor), 0) AS revenue
       FROM orders WHERE restaurant_id = ? AND created_at >= ? AND status <> 'cancelled'`,
    ).bind(session.restaurant_id, weekAgo),
    db.prepare(
      `SELECT status, COUNT(*) AS count FROM orders
       WHERE restaurant_id = ? AND created_at >= ? GROUP BY status`,
    ).bind(session.restaurant_id, weekAgo),
    db.prepare(
      `SELECT l.name_ar, SUM(l.quantity) AS sold,
              SUM(l.quantity * l.unit_price_minor) AS revenue
       FROM order_lines l JOIN orders o ON o.id = l.order_id
       WHERE l.restaurant_id = ? AND o.created_at >= ? AND o.status <> 'cancelled'
       GROUP BY l.name_ar ORDER BY sold DESC LIMIT 8`,
    ).bind(session.restaurant_id, weekAgo),
    db.prepare(
      `SELECT COUNT(*) AS count FROM reservations
       WHERE restaurant_id = ? AND status = 'new' AND date >= ?`,
    ).bind(session.restaurant_id, new Date(now).toISOString().slice(0, 10)),
  ]);

  return json({
    ok: true,
    today: today.results[0],
    week: week.results[0],
    by_status: Object.fromEntries(byStatus.results.map((row) => [row.status, row.count])),
    top_items: topItems.results,
    pending_reservations: Number(reservations.results[0]?.count || 0),
  });
}

/* ==================== الحسابات ==================== */

export async function manageUsers(request, env, session, method, userIdFromPath) {
  if (session.role !== 'owner') {
    throw new HttpError(403, 'FORBIDDEN', 'إدارة الحسابات للمالك وحده.');
  }
  if (method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, username, display_name, role, is_active, created_at
       FROM users WHERE restaurant_id = ? ORDER BY created_at`,
    ).bind(session.restaurant_id).all();
    return json({ ok: true, users: rows.results });
  }

  const body = await readJson(request, 8192);

  if (method === 'POST') {
    const username = str(body.username, 60).trim().toLowerCase();
    const password = str(body.password, 200);
    const role = str(body.role, 20);
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new HttpError(422, 'INVALID_USERNAME', 'اسم المستخدم: حروف إنجليزية وأرقام ونقطة وشرطة، من 3 إلى 40.');
    }
    if (password.length < 8) throw new HttpError(422, 'WEAK_PASSWORD', 'كلمة المرور لا تقل عن 8 محارف.');
    // المالك واحد ويأتي من لوحة أثر. لوحة المطعم تنشئ من يعمل فيه لا من يملكه.
    if (!ROLES.includes(role) || role === 'owner') {
      throw new HttpError(422, 'INVALID_ROLE', 'الدور يجب أن يكون مديرًا أو كاشير.');
    }
    const clash = await env.DB.prepare('SELECT id FROM users WHERE restaurant_id = ? AND username = ?')
      .bind(session.restaurant_id, username).first();
    if (clash) throw new HttpError(409, 'USERNAME_TAKEN', 'اسم المستخدم مستخدم داخل هذا المطعم.');

    const salt = newSalt();
    const now = Date.now();
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users
         (id, restaurant_id, username, display_name, role, password_hash, password_salt,
          password_iterations, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(id, session.restaurant_id, username, str(body.display_name, 160) || username, role,
        await derivePassword(password, salt), salt, PBKDF2_ITER, now, now),
      audit(env, session, 'USER_CREATED', 'user', id, `${username}/${role}`),
    ]);
    return json({ ok: true, user: { id, username, role, display_name: str(body.display_name, 160) || username } }, 201);
  }

  const userId = str(userIdFromPath, 120);
  const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ? AND restaurant_id = ?')
    .bind(userId, session.restaurant_id).first();
  if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'الحساب غير موجود.');
  if (target.id === session.user_id && body.is_active === false) {
    throw new HttpError(409, 'CANNOT_DISABLE_SELF', 'لا يمكنك تعطيل حسابك أنت.');
  }

  const now = Date.now();
  const statements = [];
  if (body.password !== undefined) {
    const password = str(body.password, 200);
    if (password.length < 8) throw new HttpError(422, 'WEAK_PASSWORD', 'كلمة المرور لا تقل عن 8 محارف.');
    const salt = newSalt();
    statements.push(
      env.DB.prepare(
        `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
         WHERE id = ? AND restaurant_id = ?`,
      ).bind(await derivePassword(password, salt), salt, PBKDF2_ITER, now, userId, session.restaurant_id),
      // كلمة مرور جديدة تُخرج أجهزة صاحب الحساب: هذا معنى «إعادة التعيين».
      env.DB.prepare('DELETE FROM sessions WHERE restaurant_id = ? AND user_id = ?')
        .bind(session.restaurant_id, userId),
    );
  }
  if (body.is_active !== undefined) {
    statements.push(env.DB.prepare(
      'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
    ).bind(body.is_active ? 1 : 0, now, userId, session.restaurant_id));
    if (!body.is_active) {
      statements.push(env.DB.prepare('DELETE FROM sessions WHERE restaurant_id = ? AND user_id = ?')
        .bind(session.restaurant_id, userId));
    }
  }
  if (body.display_name !== undefined) {
    statements.push(env.DB.prepare(
      'UPDATE users SET display_name = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
    ).bind(str(body.display_name, 160), now, userId, session.restaurant_id));
  }
  if (!statements.length) throw new HttpError(422, 'NOTHING_TO_CHANGE', 'لم تغيّر شيئًا.');
  statements.push(audit(env, session, 'USER_UPDATED', 'user', userId, Object.keys(body).join(',')));
  await env.DB.batch(statements);
  return json({ ok: true });
}

/**
 * تغيير المستخدم بيانات دخوله بنفسه.
 *
 * لوحة أثر تستطيع إعادة التعيين دائمًا، وهذا لا يمنع صاحب الحساب من تغيير
 * كلمته: الأول استرداد عند الضياع، والثاني حق يومي.
 */
export async function changeOwnCredentials(request, env, session) {
  const body = await readJson(request, 4096);
  const current = str(body.current_password, 200);
  const next = str(body.new_password, 200);
  const nextUsername = str(body.new_username, 60).trim().toLowerCase();

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash, password_salt, password_iterations FROM users WHERE id = ?',
  ).bind(session.user_id).first();
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'الحساب غير موجود.');

  const derived = await derivePassword(current, user.password_salt, Number(user.password_iterations) || PBKDF2_ITER);
  if (!safeEqual(derived, user.password_hash)) {
    throw new HttpError(403, 'INVALID_CREDENTIALS', 'كلمة المرور الحالية غير صحيحة.');
  }

  const sets = [];
  const values = [];
  if (nextUsername && nextUsername !== user.username) {
    if (!/^[a-z0-9._-]{3,40}$/.test(nextUsername)) {
      throw new HttpError(422, 'INVALID_USERNAME', 'اسم المستخدم: حروف إنجليزية وأرقام ونقطة وشرطة، من 3 إلى 40.');
    }
    const clash = await env.DB.prepare('SELECT id FROM users WHERE restaurant_id = ? AND username = ?')
      .bind(session.restaurant_id, nextUsername).first();
    if (clash) throw new HttpError(409, 'USERNAME_TAKEN', 'اسم المستخدم مستخدم داخل هذا المطعم.');
    sets.push('username = ?');
    values.push(nextUsername);
  }
  if (next) {
    if (next.length < 8) throw new HttpError(422, 'WEAK_PASSWORD', 'كلمة المرور لا تقل عن 8 محارف.');
    const salt = newSalt();
    sets.push('password_hash = ?', 'password_salt = ?', 'password_iterations = ?');
    values.push(await derivePassword(next, salt), salt, PBKDF2_ITER);
  }
  if (!sets.length) throw new HttpError(422, 'NOTHING_TO_CHANGE', 'لم تغيّر شيئًا.');

  const statements = [
    env.DB.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...values, Date.now(), session.user_id),
    audit(env, session, 'CREDENTIALS_CHANGED', 'user', session.user_id, sets.join(',')),
  ];
  if (next) {
    // تغيير الكلمة يُخرج بقية الأجهزة ويُبقي الجهاز الحالي: إخراج الجميع
    // يجعل المستخدم يظن أن التغيير فشل.
    statements.push(env.DB.prepare(
      'DELETE FROM sessions WHERE restaurant_id = ? AND user_id = ? AND token_hash <> ?',
    ).bind(session.restaurant_id, session.user_id, session.token_hash));
  }
  await env.DB.batch(statements);
  return json({ ok: true });
}
