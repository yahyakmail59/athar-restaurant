/**
 * الطلبات والحجوزات.
 *
 * القاعدة الحاكمة: **السعر يُحسب على الخادم من قاعدة البيانات**. المتصفح
 * يرسل معرّفات وكميات لا أرقامًا. أي صفحة تُرسل السعر تجعل تعديل عنصر واحد
 * في أدوات المطوّر كافيًا لشراء وجبة بشيكل، وهذا ما يجعل الإيصال المرسوم
 * على الخادم ذا معنى أصلًا.
 */

import { HttpError, json, money, num, orderCode, str } from './lib.js';
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

  if (source === 'online') {
    if (!customerName) throw new HttpError(422, 'NAME_REQUIRED', 'الاسم مطلوب.');
    if (!/^[\d+\-\s()]{7,30}$/.test(phone)) {
      throw new HttpError(422, 'PHONE_REQUIRED', 'رقم هاتف صحيح مطلوب للتواصل بشأن الطلب.');
    }
    if (fulfillment === 'delivery' && !address) {
      throw new HttpError(422, 'ADDRESS_REQUIRED', 'العنوان مطلوب للتوصيل.');
    }
  }

  const { lines, total, hasUnpriced } = await priceLines(env, restaurant.restaurant_id, body.lines, lang);

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
       (id, restaurant_id, order_id, menu_item_id, variant_name_ar, addons_json,
        name_ar, name_en, quantity, unit_price_minor, is_priced, price_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), restaurant.restaurant_id, orderId, line.menu_item_id,
      line.variant_name_ar, line.addons_json, line.name_ar, line.name_en,
      line.quantity, line.unit_price_minor, line.is_priced, line.price_note, now,
    ));
  }
  await env.DB.batch(statements);

  return { id: orderId, code, token, total_minor: total, has_unpriced_lines: hasUnpriced, lines };
}

/** الطلب العام من الموقع. */
export async function publicOrder(request, env, restaurant, settings, body, lang) {
  const ip = request.headers.get('CF-Connecting-IP') || '0';
  await rateLimit(env.DB, `${restaurant.restaurant_id}|ord|${ip}`, 12, 10 * 60e3);

  const order = await createOrder(env, restaurant, settings, body, { source: 'online', lang });
  const waNumber = String(settings.whatsapp_number || '').replace(/\D/g, '');
  const summary = order.lines
    .map((line) => `• ${line.quantity} × ${line.name_ar}`)
    .join('\n');
  return json({
    ok: true,
    token: order.token,
    code: order.code,
    total: money(order.total_minor, settings.currency || '₪'),
    whatsapp_url: waNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`طلب ${order.code}\n${summary}`)}`
      : '',
    message: `تم استلام طلبك برقم ${order.code}.`,
  }, 201);
}

/* ==================== الحجوزات ==================== */

const timeToMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

/**
 * الحجز العام.
 *
 * كل قيد هنا مأخوذ من `settings`: ساعات العمل، الطول الزمني للفترة، عدد
 * الحجوزات لكل فترة، وكم يومًا مقدَّمًا. مطعم بطاولتين ومطعم بمئة طاولة
 * يستعملان نفس الشيفرة.
 */
export async function publicReservation(request, env, restaurant, settings, body) {
  if (!planAllows(restaurant.plan_code, 'reservations')) {
    throw new HttpError(402, 'PLAN_REQUIRED', 'الحجوزات جزء من الباقة الكاملة.');
  }
  const ip = request.headers.get('CF-Connecting-IP') || '0';
  await rateLimit(env.DB, `${restaurant.restaurant_id}|res|${ip}`, 6, 30 * 60e3);

  const fullName = str(body.full_name, 80).trim();
  const phone = str(body.phone, 30).trim();
  const date = str(body.date, 10).trim();
  const time = str(body.time, 5).trim();
  const guests = num(body.guests);

  if (!fullName) throw new HttpError(422, 'NAME_REQUIRED', 'الاسم مطلوب.');
  if (!/^[\d+\-\s()]{7,30}$/.test(phone)) {
    throw new HttpError(422, 'PHONE_REQUIRED', 'رقم هاتف صحيح مطلوب لتأكيد الحجز.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(422, 'INVALID_DATE', 'التاريخ غير صحيح.');
  if (guests < 1 || guests > 50) throw new HttpError(422, 'INVALID_GUESTS', 'عدد الضيوف غير مقبول.');

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + Number(settings.max_reservation_days_ahead || 30) * 864e5)
    .toISOString().slice(0, 10);
  if (date < today) throw new HttpError(422, 'DATE_IN_PAST', 'لا يمكن الحجز في تاريخ مضى.');
  if (date > maxDate) {
    throw new HttpError(422, 'DATE_TOO_FAR', `الحجز متاح حتى ${maxDate}.`);
  }

  const minutes = timeToMinutes(time);
  const open = timeToMinutes(settings.reservation_open_time || '12:00');
  const close = timeToMinutes(settings.reservation_close_time || '23:00');
  if (minutes < 0 || minutes < open || minutes > close) {
    throw new HttpError(422, 'OUTSIDE_HOURS',
      `الحجز متاح بين ${settings.reservation_open_time} و${settings.reservation_close_time}.`);
  }
  const slot = Number(settings.reservation_slot_minutes || 30);
  if (slot > 0 && (minutes - open) % slot !== 0) {
    throw new HttpError(422, 'INVALID_SLOT', `اختر وقتًا كل ${slot} دقيقة.`);
  }

  // الطاقة الاستيعابية تُقاس على الخادم لحظة الحفظ: حسابها في المتصفح يعني
  // أن حجزين متزامنين يمرّان معًا.
  const taken = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM reservations
     WHERE restaurant_id = ? AND date = ? AND time = ? AND status <> 'cancelled'`,
  ).bind(restaurant.restaurant_id, date, time).first();
  if (Number(taken?.count || 0) >= Number(settings.max_reservations_per_slot || 4)) {
    throw new HttpError(409, 'SLOT_FULL', 'هذا الموعد مكتمل. جرّب وقتًا آخر.');
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO reservations
     (id, restaurant_id, full_name, phone, date, time, guests, occasion, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
  ).bind(
    crypto.randomUUID(), restaurant.restaurant_id, fullName, phone, date, time, guests,
    str(body.occasion, 60), str(body.notes, 300), now, now,
  ).run();

  return json({
    ok: true,
    message: `تم استلام طلب الحجز ليوم ${date} الساعة ${time}. سنتواصل معك لتأكيده.`,
  }, 201);
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
