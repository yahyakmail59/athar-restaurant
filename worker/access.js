/**
 * طبقة القبول: من يقرأ ماذا، ومن يكتب ماذا، وما الذي تشمله كل باقة.
 *
 * المكان الوحيد الذي يقرر الصلاحية. أي قاعدة تُكتب هنا فقط، فلا تتفرق نسخ
 * منها في المسارات ثم تختلف.
 *
 * مبدأ ثابت: المنع على الخادم لا في الواجهة. إخفاء زر لا يمنع طلبًا مباشرًا.
 */

/** الأدوار داخل المطعم، من الأوسع إلى الأضيق. */
export const ROLES = ['owner', 'manager', 'cashier'];

/**
 * الباقتان.
 *
 * `menu`: موقع وهوية ومنيو وسلة محلية وإرسال عبر واتساب. لا طلبات محفوظة
 *         ولا حجوزات ولا كاشير — أي شيء يحتاج تشغيلًا يوميًا.
 * `full`: كل ما سبق، مع حفظ الطلب على الخادم قبل واتساب، والحجوزات،
 *         والكاشير، ولوحة التشغيل، والتقارير.
 */
export const PLANS = ['menu', 'full'];

/** ما تضيفه الباقة الكاملة وحدها. */
const FULL_ONLY_FEATURES = new Set([
  'orders',        // حفظ الطلب على الخادم
  'reservations',  // الحجوزات
  'cashier',       // شاشة الكاشير
  'dashboard',     // لوحة التشغيل والتقارير
  'receipts',      // إيصال الطلب صورةً
]);

export const planAllows = (planCode, feature) =>
  !FULL_ONLY_FEATURES.has(feature) || planCode === 'full';

/**
 * الجداول التي تُدار من لوحة المطعم، وأي دور يكتب فيها.
 *
 * الكاشير يفتح الطلبات ويغيّر حالتها ولا يمسّ المنيو ولا الأسعار: من يبيع
 * لا يملك تغيير ما يبيع به.
 */
const CONTENT_SECTIONS = {
  settings:      { write: ['owner', 'manager'] },
  hero_stats:    { write: ['owner', 'manager'] },
  categories:    { write: ['owner', 'manager'] },
  menu_items:    { write: ['owner', 'manager'] },
  variants:      { write: ['owner', 'manager'] },
  addons:        { write: ['owner', 'manager'] },
  offers:        { write: ['owner', 'manager'] },
  services:      { write: ['owner', 'manager'] },
  testimonials:  { write: ['owner', 'manager'] },
  faqs:          { write: ['owner', 'manager'] },
  social_posts:  { write: ['owner', 'manager'] },
  reservations:  { write: ['owner', 'manager', 'cashier'] },
  orders:        { write: ['owner', 'manager', 'cashier'] },
  users:         { write: ['owner'] },
};

export const isKnownSection = (section) => Object.hasOwn(CONTENT_SECTIONS, section);

export function canWriteSection(role, section) {
  const config = CONTENT_SECTIONS[section];
  return Boolean(config) && config.write.includes(role);
}

/** كل من دخل لوحة المطعم يقرأ محتواها؛ الكتابة وحدها مقيّدة بالدور. */
export const canReadSection = (role, section) =>
  isKnownSection(section) && ROLES.includes(role);

/**
 * حقول الهوية التي تملكها لوحة أثر لا المطعم.
 *
 * الاسم هو ما بيع عليه الاشتراك، والباقة قرار تجاري. `settings` تُحدَّث من
 * لوحة المطعم، فيجب استبعاد هذه الحقول مهما أُرسلت — تمامًا كما في محرك
 * المدارس.
 */
export const ATHAR_OWNED_SETTINGS = new Set(['name_ar', 'name_en', 'plan_code']);

// `admin.js` يبني قائمة المنع من هذه المجموعة، فلا توجد نسخة ثانية تتخلّف عنها.

/** يزيل ما لا يملكه المطعم من جسم تحديث الإعدادات. */
export function stripAtharOwned(patch) {
  const clean = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!ATHAR_OWNED_SETTINGS.has(key)) clean[key] = value;
  }
  return clean;
}
