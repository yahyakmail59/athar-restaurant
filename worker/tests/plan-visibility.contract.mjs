/**
 * ما لا تشمله الباقة لا يُعرض — لا للزبون ولا لصاحب المطعم.
 *
 * القاعدة: **حقل بلا أثر يُخفى.** وشاشةٌ أو نموذجٌ يُعرض ثم يفشل أسوأ من
 * غيابه، لأن الفاشل يُلقي اللوم على من استعمله.
 *
 * ثلاثة أعطال حقيقية يمنع هذا الملف عودتها:
 *
 * 1) **نموذج الحجز على موقع باقة المنيو.** `render.js` كان يقرأ
 *    `show_reservation` وحده — وهو يقول «صاحب المطعم يريد إظهاره» لا «هل
 *    يعمل». فيملأ الزبون النموذج فيُردّ عليه «تعذّر إرسال طلب الحجز. راجع
 *    البيانات» وبياناته سليمة. يلوم نفسه، يعيد، ييأس؛ وصاحب المطعم لا يعلم
 *    أن أحدًا حاول أن يحجز عنده. رأيته حيًّا على `dora.athar.date`: 303 إلى
 *    `err_reservation`.
 *
 * 2) **شاشة تُفتح بلا صلاحية.** `showPanel` كانت تفتح ما يُطلب منها مهما
 *    كان. إخفاء الزرّ ليس منعًا: من يناديها بغير طريق الزرّ يرى شاشة تنهار
 *    على 402 بعد أن انتظر تحميلها.
 *
 * 3) **زرّ فاتورة لمطعم نزل إلى المنيو.** روابط طلباته القديمة تبقى حيّة
 *    عند زبائنه، وزرّ الفاتورة فيها يقود إلى صفحة 402.
 *
 * وكلّه فوق المنع الخادمي لا بديلًا عنه: كل مسار يفحص الباقة بنفسه.
 *
 * التشغيل: node worker/tests/plan-visibility.contract.mjs
 */

import { readFileSync } from 'node:fs';
import { planAllows } from '../access.js';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const site = read('../site.js');
const render = read('../render.js');
const worker = read('../worker.js');
const app = read('../../public/app.js');
const access = read('../access.js');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ---------- 1) الحجز على الموقع العام ---------- */

check(
  'الباقة تُطفئ الحجز عند تحميل الموقع',
  /planAllows\(planCode, 'reservations'\)/.test(site)
  && /settings\.results\[0\]\.show_reservation = 0/.test(site),
  'في `loadSite` وحدها — ثلاثة مواضع في القوالب تقرأ الراية نفسها',
);

check(
  'الباقة تصل إلى `loadSite` فعلًا',
  !/loadSite\(env, restaurant\.restaurant_id\)/.test(worker)
  && /loadSite\(env, restaurant\.restaurant_id, restaurant\.plan_code\)/.test(worker),
  'نداء بلا باقة يجعل الافتراضي يمرّ ويعود العطل صامتًا',
);

// والقوالب تبقى مربوطة بالراية: لو فُكّ ارتباط موضع منها لصار يظهر دائمًا.
const flagged = (render.match(/on\(s\.show_reservation\)|on\(settings\.show_reservation\)/g) || []).length;
check(
  'كل مواضع الحجز مربوطة بالراية',
  flagged >= 3,
  `${flagged} مواضع: رابط الترويسة، والقسم، ورابط التذييل`,
);

/* ---------- 2) شاشات اللوحة ---------- */

check(
  '`showPanel` ترفض شاشة ليست له',
  /state\.allowed && state\.allowed\[name\] === false/.test(app),
  'إخفاء الزرّ ليس منعًا — الدالة تُنادى من غير طريقه',
);

check(
  'خريطة المسموح محفوظة لا عابرة',
  /state\.allowed = gated/.test(app),
  'بُنيت للتنقّل ثم كانت تُهمل، فلا يبقى ما يُسأل عنه لاحقًا',
);

/* ---------- 3) زرّ الفاتورة ---------- */

check(
  'رابط الفاتورة لا يُبنى لباقة لا تشمله',
  /planAllows\(restaurant\.plan_code, 'receipts'\)/.test(worker),
);

check(
  'وأزرار الفاتورة تسقط مع الرابط',
  /\$\{receiptUrl \? `<div class="receipt-actions">/.test(render),
  'رابط فارغ في `href` يُبقي زرًّا يَعِد بما لا يُعطى',
);

/* ---------- والمنع الخادمي باقٍ تحت كل هذا ---------- */

const guards = (read('../admin.js').match(/PLAN_REQUIRED/g) || []).length;
check(
  'المنع على الخادم لم يُستبدل بالإخفاء',
  guards >= 6,
  `${guards} حارس 402 في مسارات اللوحة`,
);

check(
  'الميزات المقيّدة كما هي',
  ['orders', 'reservations', 'cashier', 'dashboard', 'receipts']
    .every((f) => !planAllows('menu', f) && planAllows('full', f))
  && ['site', 'menu'].every((f) => planAllows('menu', f)),
  'خمس ميزات للكاملة وحدها، وما عداها للاثنتين',
);

check(
  'قائمة الميزات مصدرها واحد',
  /FULL_ONLY_FEATURES = new Set\(/.test(access)
  && (access.match(/FULL_ONLY_FEATURES/g) || []).length === 2,
  'تعريف واحد واستعمال واحد — لا نسخة ثانية تتخلّف',
);

const failed = checks.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} فحصًا فشل.`);
  process.exit(1);
}
console.log('\nrestaurant-plan-visibility-contract-ok');
