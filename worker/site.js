/**
 * قراءة موقع مطعم واحد من قاعدة البيانات.
 *
 * كل استعلام هنا مقيّد بـ`restaurant_id`، وهو يأتي من الـslug في المسار لا من
 * جسم الطلب. الصفحة عامة فلا جلسة تحمله، لذلك الحارس هو أن كل دالة تأخذه
 * وسيطًا واحدًا صريحًا: لا يوجد استعلام يمكن أن ينسى الشرط ويعمل.
 */

const ACTIVE = 'is_active = 1';
import { planAllows } from './access.js';

/** يحلّ الـslug إلى مطعم عامل. الموقوف والمؤرشف لا يُخدَم موقعه. */
export async function resolveRestaurant(env, slug) {
  const row = await env.DB.prepare(
    `SELECT restaurant_id, slug, name, plan_code, environment, is_active, lifecycle_status
     FROM restaurants WHERE slug = ?`,
  ).bind(String(slug || '').toLowerCase()).first();
  if (!row) return null;
  return row;
}

export async function loadSettings(env, restaurantId) {
  return env.DB.prepare('SELECT * FROM settings WHERE restaurant_id = ?').bind(restaurantId).first();
}

/**
 * كل ما تحتاجه الصفحة في دفعة واحدة.
 *
 * D1 يحاسب على عدد الاستعلامات لا على حجمها، وصفحة تُبنى باستعلام لكل قسم
 * تصير عشرة ذهابات وإياب. `batch` يجعلها واحدة.
 */
/**
 * يقرأ كل ما تعرضه صفحة المطعم العامة.
 *
 * الباقة تُطفئ الحجز هنا لا في القوالب: ثلاثة مواضع في `render.js` تقرأ
 * `show_reservation` — رابط الترويسة، والقسم نفسه، ورابط التذييل —
 * وإطفاؤه في مكان واحد يُغلقها جميعًا فلا يتخلّف موضع عن أخيه.
 *
 * ولماذا أصلًا: `show_reservation` يقول «صاحب المطعم يريد إظهاره»،
 * والباقة تقول «هل يعمل». وكان الموقع يقرأ الأول ويتجاهل الثاني، فيعرض
 * مطعمٌ على باقة المنيو نموذج حجز كاملًا، يملؤه الزبون فيُردّ عليه
 * «تعذّر إرسال طلب الحجز. راجع البيانات» — وبياناته سليمة. فيلوم نفسه
 * ويعيد المحاولة ثم ييأس، وصاحب المطعم لا يعلم أن أحدًا حاول أن يحجز
 * عنده. رأيته حيًّا على `dora.athar.date`: 303 إلى `err_reservation`.
 *
 * وليس هذا إخفاءً بديلًا عن المنع: `publicReservation` يرفض بنفسه أيضًا.
 * الإخفاء يمنع أن يُطلب من الزبون ما لا يمكن أن ينجح أصلًا.
 */
export async function loadSite(env, restaurantId, planCode = '') {
  const db = env.DB;
  const [settings, heroStats, categories, items, variants, addons, offers,
    services, testimonials, faqs, socialPosts] = await db.batch([
    db.prepare('SELECT * FROM settings WHERE restaurant_id = ?').bind(restaurantId),
    db.prepare(`SELECT * FROM hero_stats WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM categories WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1 ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM menu_item_variants WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM menu_item_addons WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM offers WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM services WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM testimonials WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM faqs WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
    db.prepare(`SELECT * FROM social_posts WHERE restaurant_id = ? AND ${ACTIVE} ORDER BY display_order`).bind(restaurantId),
  ]);

  // الحجز وحده يُطفأ، لا القسم كلّه: القسم يحمل معه بطاقة التواصل
  // (العنوان والساعات والهاتف) ولوحة الطلب على واتساب، وهما من صميم
  // باقة المنيو. راية مستقلة كي لا يُسقط الحارسُ ما جاء يحرسه.
  if (settings.results?.[0]) {
    settings.results[0].plan_reservations = planAllows(planCode, 'reservations') ? 1 : 0;
  }

  const byItem = (rows) => {
    const map = new Map();
    for (const row of rows.results) {
      if (!map.has(row.menu_item_id)) map.set(row.menu_item_id, []);
      map.get(row.menu_item_id).push(row);
    }
    return map;
  };
  const variantMap = byItem(variants);
  const addonMap = byItem(addons);
  const categoryById = new Map(categories.results.map((row) => [row.id, row]));

  const menuItems = items.results.map((item) => {
    const category = categoryById.get(item.category_id);
    return {
      ...item,
      category_slug: category?.slug || '',
      category_icon: category?.icon || '',
      variants: variantMap.get(item.id) || [],
      addons: addonMap.get(item.id) || [],
    };
  });

  return {
    settings: settings.results[0] || null,
    heroStats: heroStats.results,
    categories: categories.results,
    items: menuItems,
    offers: offers.results,
    services: services.results,
    testimonials: testimonials.results,
    faqs: faqs.results,
    socialPosts: socialPosts.results,
  };
}

/**
 * الأكثر طلبًا: الأصناف الثمانية الأعلى مبيعًا خلال آخر ٩٠ يومًا، محسوبة من
 * طلبات فعلية غير ملغاة — لا رقم يختاره أحد يدويًا. `online`/`cashier` مفصولان
 * لأن أضنة يعرضهما منفصلين تحت كل صنف («٤٢ أونلاين · ١٨ داخل المطعم»).
 */
export async function loadBestSellers(env, restaurantId, limit = 8) {
  const since = Date.now() - 90 * 864e5;
  const rows = await env.DB.prepare(
    `SELECT l.menu_item_id AS id, l.name_ar, l.name_en, MIN(l.unit_price_minor) AS price_minor,
            m.image_url, SUM(l.quantity) AS order_count,
            SUM(CASE WHEN o.source = 'online' THEN l.quantity ELSE 0 END) AS online_order_count,
            SUM(CASE WHEN o.source = 'cashier' THEN l.quantity ELSE 0 END) AS cashier_order_count
     FROM order_lines l
     JOIN orders o ON o.id = l.order_id
     LEFT JOIN menu_items m ON m.id = l.menu_item_id
     WHERE l.restaurant_id = ? AND l.menu_item_id IS NOT NULL
       AND o.status <> 'cancelled' AND o.created_at >= ?
     GROUP BY l.menu_item_id
     ORDER BY order_count DESC
     LIMIT ?`,
  ).bind(restaurantId, since, limit).all();
  return rows.results;
}
