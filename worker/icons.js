/**
 * أيقونات — منقولة حرفيًا عن خصائص `lucide_icon` في أضنة.
 *
 * القاعدة نفسها كالخطوط: يُخزَّن **معنى** الأيقونة لا اسمها في مكتبة الرسم
 * ('غرلّ' لا 'flame')، فيختار صاحب المطعم من قائمة قصيرة مفهومة، ويترجمها
 * الخادم إلى اسم الأيقونة الفعلي عند العرض. حزمة الأيقونات المرفقة
 * (`site/js/lucide-slim.js`) تحمل ٣٠ أيقونة فقط — تحديدًا هذه المستعملة —
 * فقيمة غير معروفة تسقط بأمان على أيقونة عامة بدل أن تكسر الصفحة.
 */

export const HERO_STAT_ICONS = {
  leaf: 'leaf', clock: 'timer', crown: 'crown', fire: 'flame', star: 'star',
};

export const CATEGORY_ICONS = {
  skewer: 'flame', burger: 'sandwich', pasta: 'soup', pizza: 'pizza',
  drink: 'cup-soda', dessert: 'cake-slice', fish: 'fish', salad: 'salad',
};

export const SERVICE_ICONS = {
  dine: 'utensils', bag: 'shopping-bag', scooter: 'bike',
  whatsapp: 'message-circle', leaf: 'leaf', clock: 'timer',
};

const lucide = (map, key, fallback) => map[key] || fallback;

export const heroStatLucide = (key) => lucide(HERO_STAT_ICONS, key, 'sparkles');
export const categoryLucide = (key) => lucide(CATEGORY_ICONS, key, 'utensils');
export const serviceLucide = (key) => lucide(SERVICE_ICONS, key, 'sparkles');

/** تسميات عربية للقوائم المنسدلة في لوحتي أثر والمطعم. */
export const HERO_STAT_LABELS = {
  leaf: 'ورقة (طازج/طبيعي)', clock: 'ساعة (سرعة/توقيت)', crown: 'تاج (تميّز)',
  fire: 'نار (شواء)', star: 'نجمة (تقييم)',
};
export const CATEGORY_LABELS = {
  skewer: 'شواء', burger: 'ساندويتش', pasta: 'معكرونة/شوربة', pizza: 'بيتزا',
  drink: 'مشروبات', dessert: 'حلويات', fish: 'أسماك', salad: 'سلطات',
};
export const SERVICE_LABELS = {
  dine: 'تناول في المطعم', bag: 'استلام', scooter: 'توصيل',
  whatsapp: 'واتساب', leaf: 'ورقة (طازج/طبيعي)', clock: 'ساعة (سرعة/توقيت)',
};
