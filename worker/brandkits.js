/**
 * بنك الهويات الجاهزة — تُختار من لوحة أثر عند إنشاء مطعم.
 *
 * كل هوية: وضعٌ (فاتح أو داكن) + ألوان + أربعة خطوط من `fonts.js` حصرًا +
 * طبقة ثيم اختيارية. تُطبَّق مرّة عند الإنشاء بكتابة قيمها في `settings`،
 * وبعدها الهوية ملك المطعم يغيّرها من لوحته كما يشاء.
 *
 * **مصدر الأرقام: المشاريع الحقيقية نفسها، لا التخمين.**
 *
 * قِيست من `adana-restaurant-main/static/restaurant/css/style.css` ومن
 * `b12-restaurant-hot/static/restaurant/css/style.css` ومن
 * `fries-station-restaurant/static/restaurant/css/tokens.css`. وقورن ثمانية
 * عشر رمزًا بين أضنة وB12 فتطابقت كلّها — الأحمر والذهبيّ والأرضية والسطح
 * والخطوط الأربعة. فهما تصميم واحد لا اثنان، ولذلك هوية واحدة تحمل
 * الاسمين: هويتان متطابقتان في القائمة تُربكان من يختار ولا تُضيفان شيئًا.
 *
 * **الوضع الفاتح.** كان المحرك داكنًا في بنيته: `style.css` يُعرّف ثمانية
 * عشر رمزًا بقيم داكنة، و`rootVars` تُبدّل أحد عشر منها فقط — فبقيت
 * `--text` و`--muted` و`--line` مثبَّتة داكنة مهما فعلت الهوية، وتبديل
 * الألوان وحده كان يُنتج صفحة يختفي نصُّها. صارت الثلاثة تُحقَن كذلك،
 * فمَلَكت الهويةُ وضعَها لا لونَها وحده.
 *
 * و`mode` ليس زينة: الحارس في `worker/tests/brandkits.contract.mjs` يقيس
 * تباين النصّ على أرضيته لكل هوية، فهويةٌ تُضاف بلا تباين كافٍ تسقط في
 * الاختبار لا عند الزبون.
 */

export const BRAND_KITS = {
  b12_red: {
    label: 'شبيه B12 — أحمر وفضّي على أسود',
    description: 'أحمر ناريّ وأبيض على أسود، بخط Bebas Neue الحادّ وCairo للنصّ. '
      + 'قِيست من شعار B12 نفسه: أحمرٌ وأبيضُ على أسود، ولا ذهبَ فيه.',
    mode: 'dark',
    primary_color: '#E30613',
    // الفضّيّ لا الذهبيّ: شعار B12 خطٌّ أبيض تحت الاسم الأحمر، ولا أثر
    // للذهب فيه. وكان ذهبيًّا في الشيفرة لأن الملف نُسخ عن أضنة لا لأن
    // العلامة كذلك.
    gold_color: '#E8E8E8',
    background_color: '#050505',
    surface_color: '#111111',
    text_color: '#FFFFFF',
    // #A6A6A6 قيمة B12 نفسها في `style.css` عنده — وأضنة تكتب #B8B8B8.
    muted_color: '#A6A6A6',
    line_color: 'rgba(255,255,255,.14)',
    whatsapp_color: '#25D366',
    theme_layer: '',
    arabic_font: 'cairo',
    arabic_display_font: 'cairo',
    display_font: 'bebas-neue',
    latin_font: 'montserrat',
  },

  adana_navy: {
    label: 'شبيه أضنة — ذهبيّ على كحليّ',
    description: 'ذهبيّ على كحليّ عميق مع لوحٍ ورقيّ دافئ، بخط El Messiri للعناوين '
      + 'العربية. هويةُ أضنة الحقيقية كما في دليل علامتها، لا ما ورثته من شيفرة B12.',
    mode: 'dark',
    // الذهبيّ هو زرّ الفعل هنا لا الأحمر: الشعار ذهبٌ على كحليّ، ولا أحمر
    // في العلامة أصلًا. و`inkFor` تعطيه حبرًا داكنًا تلقائيًّا.
    primary_color: '#D4AF37',
    // الورقُ الكرافتيّ الدافئ من دليل العلامة — لهجةٌ ثانية إلى جانب الذهب.
    gold_color: '#E3CDA4',
    background_color: '#0B1D2D',
    surface_color: '#12293D',
    text_color: '#F3EEE2',
    muted_color: '#A7B7C4',
    line_color: 'rgba(212,175,55,.22)',
    whatsapp_color: '#25D366',
    theme_layer: 'luxury',
    arabic_font: 'cairo',
    arabic_display_font: 'el-messiri',
    display_font: 'playfair-display',
    latin_font: 'montserrat',
  },

  fries_station: {
    label: 'شبيه Fries Station — أحمر وكهرماني، فاتح',
    description: 'أحمر وكهرمانيّ على أبيض ورماديّ فاتح، وخطّ Reem Kufi وحده في '
      + 'الأدوار الثلاثة — وهي بصمته الطباعية. قِيست من `tokens.css` في مشروعه.',
    mode: 'light',
    primary_color: '#D71920',
    gold_color: '#FFC107',
    background_color: '#F5F5F5',
    surface_color: '#FFFFFF',
    text_color: '#222222',
    muted_color: '#555555',
    line_color: 'rgba(34,34,34,.18)',
    // أخضر واتساب الرسميّ فاتح، والأبيض عليه لا يُقرأ على سطح فاتح.
    whatsapp_color: '#0F8244',
    theme_layer: 'light',
    arabic_font: 'cairo',
    arabic_display_font: 'reem-kufi',
    display_font: 'reem-kufi',
    latin_font: 'reem-kufi',
  },

  olive_copper: {
    label: 'الزيتون والنحاس — فاتح',
    description: 'زيتونيّ عميق ونحاسيّ على عاجيّ دافئ، بخط Aref Ruqaa للعناوين '
      + 'وAlmarai للنصّ. لا يشبه الأحمرين لونًا ولا صوتًا — للمشاوي والمطاعم الشعبية.',
    mode: 'light',
    primary_color: '#3E5622',
    gold_color: '#B87333',
    background_color: '#F7F3EA',
    surface_color: '#FFFDF8',
    text_color: '#1F2417',
    muted_color: '#57604B',
    line_color: 'rgba(31,36,23,.18)',
    whatsapp_color: '#0F8244',
    theme_layer: 'light',
    arabic_font: 'almarai',
    arabic_display_font: 'aref-ruqaa',
    display_font: 'playfair-display',
    latin_font: 'work-sans',
  },

  luxury_burgundy: {
    label: 'الفاخر — نبيذيّ وشمبانيا',
    description: 'نبيذيّ عميق وشمبانيا على فحميّ محمرّ، بخط Playfair Display. '
      + 'للمطاعم الراقية والعشاء — لا أحمرَ ناريًّا ولا ذهبَ صريح.',
    mode: 'dark',
    primary_color: '#8E1F38',
    gold_color: '#E5D3A3',
    background_color: '#140A0E',
    surface_color: '#22111A',
    text_color: '#F6EFE9',
    muted_color: '#C0A8AF',
    line_color: 'rgba(229,211,163,.20)',
    whatsapp_color: '#25D366',
    theme_layer: 'luxury',
    arabic_font: 'cairo',
    arabic_display_font: 'reem-kufi',
    display_font: 'playfair-display',
    latin_font: 'playfair-display',
  },

  vibrant_emerald: {
    label: 'الحيوي — زمردي',
    description: 'أخضر زمرديّ على فحميّ، بخط Changa العريض. للمطاعم الصحّية '
      + 'والعصائر والسلطات.',
    mode: 'dark',
    primary_color: '#0F9D6B',
    gold_color: '#F0B429',
    background_color: '#06100C',
    surface_color: '#0E1A15',
    text_color: '#EFF7F3',
    muted_color: '#A5BCB2',
    line_color: 'rgba(239,247,243,.14)',
    whatsapp_color: '#25D366',
    theme_layer: '',
    arabic_font: 'tajawal',
    arabic_display_font: 'changa',
    display_font: 'oswald',
    latin_font: 'work-sans',
  },

  warm_amber: {
    label: 'الدافئ — كهرماني',
    description: 'كهرمانيّ دافئ على بنّيّ داكن، بخط Almarai المستدير وعناوين '
      + 'Anton القوية. للمقاهي والحلويات.',
    mode: 'dark',
    primary_color: '#C2540A',
    gold_color: '#E8B54A',
    background_color: '#0A0705',
    surface_color: '#15100B',
    text_color: '#FBF3E7',
    muted_color: '#C3AD92',
    line_color: 'rgba(251,243,231,.14)',
    whatsapp_color: '#25D366',
    theme_layer: '',
    arabic_font: 'almarai',
    arabic_display_font: 'changa',
    display_font: 'anton',
    latin_font: 'poppins',
  },
};

/** ترتيب العرض في قائمة اللوحة — الأشهر أولًا. */
export const BRAND_KIT_ORDER = [
  'b12_red', 'adana_navy', 'fries_station', 'olive_copper',
  'luxury_burgundy', 'vibrant_emerald', 'warm_amber',
];

export const DEFAULT_BRAND_KIT = 'b12_red';

/**
 * أسماء قديمة لهويات أُعيدت تسميتها.
 *
 * `brand_kit_id` محفوظ في صفّ المستأجر داخل لوحة أثر، ومطعمٌ أُنشئ بالاسم
 * القديم يبقى يحمله. وبلا هذه الخريطة يسقط إلى الافتراضية بصمت عند أي
 * قراءة لاحقة — والصمت هنا يعني هوية تتبدّل بلا أن يطلب أحد.
 */
const ALIASES = {
  // `adana_classic` ثم `adana_b12`: اسمان لهوية واحدة كانت تجمع المطعمين.
  // وُجّها إلى B12 لا إلى أضنة: القيم التي كانت تحملها قيمُ B12 — أحمرُ على
  // أسود — لا الكحليّ الذهبيّ. والمطاعم التي أُنشئت بها تحمل تلك القيم
  // مكتوبةً في `settings`، فلا يتبدّل شكلُ أحد بهذا التوجيه.
  adana_classic: 'b12_red',
  adana_b12: 'b12_red',
  // و`luxury_navy` كان كحليًّا ذهبيًّا — وهو الآن هويةُ أضنة نفسها بالاسم
  // الصحيح. فالفاخر انتقل إلى النبيذيّ، والاسم القديم يتبعه.
  luxury_navy: 'luxury_burgundy',
};

/** يعيد قيم هوية معروفة، أو الافتراضية إن كان الرمز غير معروف. */
export const resolveBrandKit = (code) => {
  const key = ALIASES[code] || code;
  return BRAND_KITS[key] || BRAND_KITS[DEFAULT_BRAND_KIT];
};

/** قائمة الاختيار كما تعرضها اللوحة. */
export const brandKitChoices = () => BRAND_KIT_ORDER
  .filter((code) => BRAND_KITS[code])
  .map((code) => {
    const kit = BRAND_KITS[code];
    return {
      code,
      label: kit.label,
      description: kit.description,
      mode: kit.mode,
      primary_color: kit.primary_color,
      gold_color: kit.gold_color,
      background_color: kit.background_color,
    };
  });
