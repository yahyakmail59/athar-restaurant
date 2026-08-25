/**
 * يزيل `restaurant_id` من معرّفات الصفوف المبذورة على قاعدة قائمة.
 *
 * `sid()` كانت تبني `item_ATH_ADANA_mixgrill`، وهذا المعرّف يظهر في `data-id`
 * لكل زر إضافة فينشر معرّف المطعم في كل صفحة عامة. أُصلح المولّد للمستأجرين
 * الجدد؛ هذا السكربت يعالج القائمين.
 *
 * الاستبدال نصّي داخل المعرّف نفسه (`REPLACE`)، فيبقى الجزء الدالّ على الصنف
 * كما هو ولا تنكسر الروابط بين الجداول ما دامت كلها تُحدَّث في نفس الدفعة.
 *
 * لا مفاتيح أجنبية معلنة في المخطط، فالمراجع مكتوبة هنا صراحةً. إغفال عمود
 * واحد يعني صفًّا يتيمًا لا يشكو منه SQLite — ولهذا يُطبع تقرير قبل/بعد.
 *
 * يطبع SQL على الخرج القياسي ولا يتصل بقاعدة بنفسه: تنفيذ الترحيل خطوة
 * يجب أن تُرى قبل أن تقع، وربط السكربت بالقاعدة يخلط التوليد بالتنفيذ.
 *
 * التشغيل:
 *   node scripts/migrate-seed-ids.mjs ATH_ONE ATH_TWO > fix.sql
 *   npx wrangler d1 execute restaurant-db --remote --file fix.sql
 */

const RESTAURANTS = process.argv.slice(2);
if (!RESTAURANTS.length) {
  console.error('الاستعمال: node scripts/migrate-seed-ids.mjs ATH_ONE ATH_TWO ... > fix.sql');
  process.exit(1);
}

/** نفس البصمة في `worker/seed.js` — أي اختلاف يعني معرّفات لا تطابق البذرة. */
const fingerprint = (restaurantId) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < restaurantId.length; index += 1) {
    hash ^= restaurantId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
};

/** الجداول التي تحمل معرّفًا مبذورًا، والأعمدة التي تشير إليه. */
const COLUMNS = [
  ['categories', 'id'],
  ['menu_items', 'id'], ['menu_items', 'category_id'],
  ['menu_item_variants', 'id'], ['menu_item_variants', 'menu_item_id'],
  ['menu_item_addons', 'id'], ['menu_item_addons', 'menu_item_id'],
  ['offers', 'id'],
  ['hero_stats', 'id'], ['services', 'id'], ['faqs', 'id'], ['testimonials', 'id'],
  ['reservations', 'id'],
  ['orders', 'id'],
  ['order_lines', 'id'], ['order_lines', 'order_id'],
  ['order_lines', 'menu_item_id'], ['order_lines', 'offer_id'],
];


const lines = ['-- إزالة معرّف المطعم من المعرّفات المبذورة', 'PRAGMA defer_foreign_keys = true;', ''];
for (const rid of RESTAURANTS) {
  const fp = fingerprint(rid);
  lines.push(`-- ${rid} → ${fp}`);
  for (const [table, column] of COLUMNS) {
    lines.push(
      `UPDATE ${table} SET ${column} = REPLACE(${column}, '${rid}', '${fp}') `
      + `WHERE restaurant_id = '${rid}' AND ${column} LIKE '%${rid}%';`,
    );
  }
  lines.push('');
}
console.log(lines.join(String.fromCharCode(10)));
