/**
 * بنك الهويات الجاهزة — أربع هويات تُختار من لوحة أثر عند إنشاء مطعم.
 *
 * قيد حقيقي اكتشفته بالقياس لا بالتخمين: `site/css/style.css` المنسوخ عن
 * أضنة حرفيًا يفترض خلفية داكنة في 37 موضعًا (ظلال وتراكيب شفافة مضبوطة
 * لخلفية سوداء)، ولا يقرأ من متغيّر `--text` إلا في 4 مواضع فقط. تصميم
 * «فاتح للكافيهات» فعليًا يحتاج طبقة CSS جديدة (~300 سطر) لم تُبنَ بعد —
 * تبديل الألوان وحده ينتج صفحة نصّها يختفي على خلفية فاتحة. الأربع هنا
 * إذن كلها داكنة كأضنة، وتختلف باللون البارز والخطوط وطبقة الثيم الإضافية،
 * وهذا ما تثبته الهوية «الفاخرة» أصلًا: `themes/luxury.css` نفسه لا يفترض
 * لونًا بعينه، فهو طبقة محايدة تُقرأ من نفس متغيّرات المطعم.
 *
 * كل هوية: ألوان + أربعة خطوط (من `fonts.js` حصرًا) + طبقة ثيم اختيارية.
 * التطبيق يحدث مرة عند الإنشاء بكتابة هذه القيم في `settings`، وبعدها
 * الهوية ملك المطعم الكامل — يغيّرها من لوحته كما يشاء.
 */

export const BRAND_KITS = {
  adana_classic: {
    label: 'الأصلي — أحمر وذهبي',
    description: 'هوية أضنة كما هي: أحمر ناري وذهبي، بخط Cairo وعناوين Bebas Neue الحادة.',
    primary_color: '#E30613',
    gold_color: '#D4AF37',
    background_color: '#050505',
    surface_color: '#111111',
    whatsapp_color: '#25D366',
    theme_layer: '',
    arabic_font: 'cairo', arabic_display_font: 'cairo', display_font: 'bebas-neue', latin_font: 'montserrat',
  },
  luxury_navy: {
    label: 'الفاخر — كحلي وذهبي',
    description: 'طبقة بصرية إضافية فوق التصميم الأساسي: حدود ذهبية دقيقة وتدرّجات هادئة، بخط Playfair Display للعناوين.',
    primary_color: '#0B1D2D',
    gold_color: '#D4AF37',
    background_color: '#050608',
    surface_color: '#0F1620',
    whatsapp_color: '#25D366',
    theme_layer: 'luxury',
    arabic_font: 'cairo', arabic_display_font: 'reem-kufi', display_font: 'playfair-display', latin_font: 'playfair-display',
  },
  vibrant_emerald: {
    label: 'الحيوي — زمردي',
    description: 'لون بارز أخضر زمردي بدل الأحمر التقليدي، بخط Tajawal وعناوين Oswald الحديثة. مناسب لمطعم صحي أو نباتي.',
    primary_color: '#0F9D6B',
    gold_color: '#D4AF37',
    background_color: '#06100C',
    surface_color: '#0E1A15',
    whatsapp_color: '#25D366',
    theme_layer: '',
    arabic_font: 'tajawal', arabic_display_font: 'changa', display_font: 'oswald', latin_font: 'work-sans',
  },
  warm_amber: {
    label: 'الدافئ — كهرماني',
    description: 'لون بارز كهرماني دافئ يناسب المقاهي والحلويات، بخط Almarai المستدير وعناوين Anton القوية.',
    primary_color: '#C2540A',
    gold_color: '#E8B54A',
    background_color: '#0A0705',
    surface_color: '#15100B',
    whatsapp_color: '#25D366',
    theme_layer: '',
    arabic_font: 'almarai', arabic_display_font: 'changa', display_font: 'anton', latin_font: 'poppins',
  },
};

export const DEFAULT_BRAND_KIT = 'adana_classic';

export const brandKitChoices = () => Object.entries(BRAND_KITS).map(([code, kit]) => ({
  code, label: kit.label, description: kit.description,
  primary_color: kit.primary_color, gold_color: kit.gold_color, background_color: kit.background_color,
}));

/** يعيد قيم هوية معروفة، أو الافتراضية إن كان الرمز غير معروف. */
export const resolveBrandKit = (code) => BRAND_KITS[code] || BRAND_KITS[DEFAULT_BRAND_KIT];
