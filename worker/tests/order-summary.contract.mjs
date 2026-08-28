/**
 * رسالة واتساب تصف ما طلبه الزبون، لا سعره فقط.
 *
 * لماذا هذا الملف موجود: `orderSummaryText` كانت تكتب اسم الصنف وحده وتُهمل
 * `variant_name_ar` و`addons_json` — وهما محسوبان في السطر ومُسعَّران فيه.
 * فيصل المطعمَ «١ × كباب أضنة — ٨٣ ₪»: السعر سعر الكبير، والمطبخ لا يعرف
 * أنه كبير ولا أن معه أرزًا.
 *
 * وأثره يتضاعف في باقة «المنيو»: لا سجل طلب في قاعدة البيانات ولا صفحة طلب
 * — هذه الرسالة **هي** الطلب كلّه، ولا مكان آخر يُراجَع فيه ما نقص منها.
 *
 * ويُستدعى هنا الملفُّ نفسه المنشور، بسطرٍ بالشكل الذي يبنيه `priceLines`.
 *
 * التشغيل: node worker/tests/order-summary.contract.mjs
 */

import { orderSummaryText } from '../orders.js';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const line = {
  name_ar: 'كباب أضنة', name_en: 'Adana Kebab',
  variant_name_ar: 'كبير',
  addons_json: JSON.stringify([{ name_ar: 'أرز إضافي', name_en: 'Extra rice', price_minor: 800 }]),
  quantity: 1, unit_price_minor: 8300, is_priced: 1, price_note: '',
};

const ar = orderSummaryText([line], '₪', 'ar');
check('الحجم يظهر في الرسالة', ar.includes('(كبير)'), ar.split('\n')[0]);
check('الإضافة تظهر', ar.includes('+ أرز إضافي'));
check('والسعر باقٍ', ar.includes('83.00 ₪') && ar.includes('المجموع'));

const en = orderSummaryText([{ ...line, variant_name_ar: 'Large' }], '₪', 'en');
check('الرسالة الإنجليزية بأسماء إنجليزية', en.includes('Adana Kebab') && en.includes('Extra rice')
  && !en.includes('كباب'), en.split('\n')[0]);

// سطر بلا حجم ولا إضافات يبقى نظيفًا بلا أقواس فارغة ولا مسافة زائدة.
const بسيط = orderSummaryText([{ ...line, variant_name_ar: '', addons_json: '[]' }], '₪', 'ar');
check('سطر بلا خيارات بلا زوائد', /^• 1 × كباب أضنة — /.test(بسيط), بسيط.split('\n')[0]);

// إضافات تالفة لا تُسقط الرسالة: الطلب يصل ناقص التفصيل خير من ألّا يصل.
let تالف = '';
try { تالف = orderSummaryText([{ ...line, addons_json: '{ليس' }], '₪', 'ar'); } catch { /* يُلتقط أدناه */ }
check('إضافات تالفة لا تُسقط الرسالة', تالف.includes('كباب أضنة') && تالف.includes('(كبير)'));

// السعر غير الرقمي يُكتب بنصّه — القاعدة القديمة باقية.
const حرّ = orderSummaryText([{ ...line, is_priced: 0, price_note: 'حسب الطلب' }], '₪', 'ar');
check('السعر بنصّ حرّ باقٍ', حرّ.includes('حسب الطلب') && حرّ.includes('عدا ما يُسعَّر'));

const failed = checks.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} فحصًا فشل.`);
  process.exit(1);
}
console.log('\nrestaurant-order-summary-contract-ok');
