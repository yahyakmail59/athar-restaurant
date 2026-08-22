/**
 * سجل خطوط منسَّق — منقول حرفيًا عن `restaurant/fonts.py` في مشروع أضنة.
 *
 * لماذا سجل ثابت لا نص حر: يبني القالب رابط Google Fonts من قيمة الحقل
 * مباشرة. نص حر هناك يعني حقن أي شيء في رابط CSS خارجي؛ سجل مغلق يعني أن
 * كل قيمة ممكنة صالحة ومُتحقَّق منها سلفًا. هذا هو معنى «اختيار خط بلا
 * برمجة»: صاحب المطعم يختار من قائمة، ولا يكتب اسم خط بيده أبدًا.
 *
 * أربع خانات لأربعة أدوار مختلفة، لا خانة واحدة:
 *  - عربي (نص الجسم)      عربي عناوين (قد يفضّل المطعم خطًّا مزخرفًا للعناوين وحدها)
 *  - عناوين بارزة (لاتيني) لاتيني (نص الجسم الإنجليزي)
 */

export const ARABIC_FONTS = {
  cairo: ['Cairo — كايرو', 'Cairo:wght@400;600;700;800;900', '"Cairo", sans-serif'],
  tajawal: ['Tajawal — تجوّل', 'Tajawal:wght@400;500;700;800;900', '"Tajawal", sans-serif'],
  almarai: ['Almarai — المراعي', 'Almarai:wght@300;400;700;800', '"Almarai", sans-serif'],
  'el-messiri': ['El Messiri — المسيري', 'El+Messiri:wght@400;500;600;700', '"El Messiri", sans-serif'],
  changa: ['Changa — تشانغا', 'Changa:wght@400;500;600;700;800', '"Changa", sans-serif'],
  rubik: ['Rubik — روبيك', 'Rubik:wght@400;500;600;700;800;900', '"Rubik", sans-serif'],
  'noto-kufi': ['Noto Kufi Arabic — كوفي', 'Noto+Kufi+Arabic:wght@400;500;700;800;900', '"Noto Kufi Arabic", sans-serif'],
};

export const ARABIC_DISPLAY_FONTS = {
  cairo: ['Cairo — كايرو (نفس النص)', 'Cairo:wght@600;700;800;900', '"Cairo", sans-serif'],
  'reem-kufi': ['Reem Kufi — ريم كوفي', 'Reem+Kufi:wght@500;600;700', '"Reem Kufi", sans-serif'],
  'aref-ruqaa': ['Aref Ruqaa — عريف الرقعة', 'Aref+Ruqaa:wght@400;700', '"Aref Ruqaa", serif'],
  'el-messiri': ['El Messiri — المسيري', 'El+Messiri:wght@500;600;700', '"El Messiri", sans-serif'],
  lalezar: ['Lalezar — لاله‌زار', 'Lalezar', '"Lalezar", system-ui, sans-serif'],
  rakkas: ['Rakkas — ركّاس', 'Rakkas', '"Rakkas", serif'],
  changa: ['Changa — تشانغا', 'Changa:wght@500;600;700;800', '"Changa", sans-serif'],
};

export const DISPLAY_FONTS = {
  'bebas-neue': ['Bebas Neue', 'Bebas+Neue', '"Bebas Neue", sans-serif'],
  anton: ['Anton', 'Anton', '"Anton", sans-serif'],
  oswald: ['Oswald', 'Oswald:wght@400;500;600;700', '"Oswald", sans-serif'],
  teko: ['Teko', 'Teko:wght@400;500;600;700', '"Teko", sans-serif'],
  'archivo-black': ['Archivo Black', 'Archivo+Black', '"Archivo Black", sans-serif'],
  'playfair-display': ['Playfair Display', 'Playfair+Display:wght@400;500;600;700;800;900', '"Playfair Display", serif'],
};

export const LATIN_FONTS = {
  montserrat: ['Montserrat', 'Montserrat:wght@500;600;700;800', '"Montserrat", sans-serif'],
  poppins: ['Poppins', 'Poppins:wght@400;500;600;700;800', '"Poppins", sans-serif'],
  inter: ['Inter', 'Inter:wght@400;500;600;700;800', '"Inter", sans-serif'],
  roboto: ['Roboto', 'Roboto:wght@400;500;700;900', '"Roboto", sans-serif'],
  'work-sans': ['Work Sans', 'Work+Sans:wght@400;500;600;700;800', '"Work Sans", sans-serif'],
  'playfair-display': ['Playfair Display', 'Playfair+Display:wght@400;500;600;700;800;900', '"Playfair Display", serif'],
};

export const DEFAULT_ARABIC = 'cairo';
export const DEFAULT_ARABIC_DISPLAY = 'cairo';
export const DEFAULT_DISPLAY = 'bebas-neue';
export const DEFAULT_LATIN = 'montserrat';

/** أزواج (قيمة، تسمية) لبناء قائمة اختيار — لوحة أثر ولوحة المطعم كلتاهما. */
export const choices = (registry) => Object.entries(registry).map(([key, entry]) => [key, entry[0]]);

const entry = (registry, key, fallback) => registry[key] || registry[fallback];

/** قيمة `font-family` الجاهزة للحقن في CSS. */
export const stack = (registry, key, fallback) => entry(registry, key, fallback)[2];

/**
 * رابط Google Fonts واحد يغطي كل الخطوط الأربعة المختارة، بلا تكرار عائلة.
 *
 * دُمج طلب واحد بدل أربعة: كل طلب خط إضافي رحلة شبكة كاملة على هاتف قد
 * يكون بطيئًا، وأربع طلبات متوازية أبطأ من طلب مدمج على شبكة ضعيفة.
 */
export function fontUrl(arabicKey, displayKey, latinKey, arabicDisplayKey) {
  const selected = [
    entry(ARABIC_FONTS, arabicKey, DEFAULT_ARABIC),
    entry(ARABIC_DISPLAY_FONTS, arabicDisplayKey || arabicKey, DEFAULT_ARABIC_DISPLAY),
    entry(DISPLAY_FONTS, displayKey, DEFAULT_DISPLAY),
    entry(LATIN_FONTS, latinKey, DEFAULT_LATIN),
  ];
  const seen = new Set();
  const fragments = [];
  for (const [, css2] of selected) {
    const family = css2.split(':', 1)[0];
    if (!seen.has(family)) {
      seen.add(family);
      fragments.push(css2);
    }
  }
  const query = fragments.map((fragment) => `family=${fragment}`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}
