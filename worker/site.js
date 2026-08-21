/**
 * قراءة موقع مطعم واحد من قاعدة البيانات.
 *
 * كل استعلام هنا مقيّد بـ`restaurant_id`، وهو يأتي من الـslug في المسار لا من
 * جسم الطلب. الصفحة عامة فلا جلسة تحمله، لذلك الحارس هو أن كل دالة تأخذه
 * وسيطًا واحدًا صريحًا: لا يوجد استعلام يمكن أن ينسى الشرط ويعمل.
 */

const ACTIVE = 'is_active = 1';

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
export async function loadSite(env, restaurantId) {
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

  const menuItems = items.results.map((item) => ({
    ...item,
    variants: variantMap.get(item.id) || [],
    addons: addonMap.get(item.id) || [],
  }));

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
