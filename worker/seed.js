/**
 * بذرة المحتوى.
 *
 * قسمان مختلفان في الغرض:
 *
 * `defaultContentStatements` — النسخة الحقيقية. صف إعدادات واحد بعناوين
 * أقسام ونصوص أزرار مكتوبة. لا أصناف ولا عروض ولا آراء: المطعم يملأها بنفسه.
 * لكن موقعًا بعناوين فارغة يفتحه صاحبه فلا يعرف أين يكتب، فالنصوص الهيكلية
 * جزء من المنتج لا من العرض.
 *
 * `demoSeedStatements` — نسخة العرض. مطعم كامل يُفتح رابطه أمام عميل فيرى
 * منتجًا يعمل: منيو بأقسام وأحجام وإضافات، عروض، آراء، حجوزات وطلبات موزّعة
 * على الحالات والأيام حتى تكون لوحة التشغيل ذات معنى. البذرة ثابتة تمامًا،
 * فالعرض الذي رآه العميل أمس هو نفسه اليوم.
 *
 * كل المبالغ أعداد صحيحة بالأغورة. لا REAL في أي مكان.
 */

export const DEMO_SEED_VERSION = 'restaurant-demo-1';

const DAY = 24 * 60 * 60 * 1000;

/** معرّف ثابت: نفس البذرة تعطي نفس المفاتيح، فإعادة البذر لا تضاعف الصفوف. */
const sid = (restaurantId, kind, key) => `${kind}_${restaurantId}_${key}`;

/* ==================== النسخة الحقيقية ==================== */

export function defaultContentStatements(db, restaurantId, { displayName, config, now, brandKit }) {
  const settings = {
    name_ar: displayName,
    name_en: String(config.short_name || displayName),
    tagline_ar: 'نكهة تُروى',
    tagline_en: 'A taste worth telling',

    // الهوية المختارة من لوحة أثر عند الإنشاء. بعدها ملك المطعم الكامل —
    // هذه القيم الأولى فقط، لا قيد يمنعه من تغييرها من لوحته لاحقًا.
    primary_color: brandKit.primary_color, gold_color: brandKit.gold_color,
    background_color: brandKit.background_color, surface_color: brandKit.surface_color,
    whatsapp_color: brandKit.whatsapp_color, theme_layer: brandKit.theme_layer,
    arabic_font: brandKit.arabic_font, arabic_display_font: brandKit.arabic_display_font,
    display_font: brandKit.display_font, latin_font: brandKit.latin_font,

    hero_title_ar: displayName,
    hero_title_en: String(config.short_name || displayName),
    hero_text_ar: 'اكتشف قائمتنا واطلب في دقائق.',
    hero_text_en: 'Explore our menu and order in minutes.',

    about_title_ar: 'من نحن', about_title_en: 'About Us',
    about_text_ar: '', about_text_en: '',
    menu_title_ar: 'قائمة الطعام', menu_title_en: 'Our Menu',
    featured_title_ar: 'الأكثر طلبًا', featured_title_en: 'Most Ordered',
    offers_title_ar: 'العروض', offers_title_en: 'Offers',
    services_title_ar: 'خدماتنا', services_title_en: 'Our Services',
    reviews_title_ar: 'آراء ضيوفنا', reviews_title_en: 'Guest Reviews',
    reservation_title_ar: 'احجز طاولتك', reservation_title_en: 'Book a Table',
    reservation_text_ar: 'اختر الموعد وسنؤكد حجزك هاتفيًا.',
    reservation_text_en: 'Pick a time and we will confirm by phone.',
    faq_title_ar: 'أسئلة متكررة', faq_title_en: 'FAQ',
    social_title_ar: 'تابعنا', social_title_en: 'Follow Us',

    order_cta_ar: 'اطلب الآن', order_cta_en: 'Order Now',
    menu_cta_ar: 'تصفّح القائمة', menu_cta_en: 'View Menu',
    whatsapp_panel_text_ar: 'راسلنا على واتساب', whatsapp_panel_text_en: 'Message us on WhatsApp',

    seo_title_ar: displayName, seo_title_en: String(config.short_name || displayName),
    seo_description_ar: `${displayName} — قائمة الطعام والطلب والحجز.`,
    seo_description_en: `${config.short_name || displayName} — menu, ordering and reservations.`,
    footer_text_ar: `© ${new Date(now).getFullYear()} ${displayName}`,
    footer_text_en: `© ${new Date(now).getFullYear()} ${config.short_name || displayName}`,

    whatsapp_number: String(config.whatsapp || config.phone || ''),
    phone: String(config.phone || ''),
    email: String(config.email || ''),
    address_ar: String(config.address || ''), address_en: '',
    hours_ar: 'يوميًا ١٢:٠٠ ظهرًا — ١١:٠٠ مساءً',
    hours_en: 'Daily 12:00 PM — 11:00 PM',
    currency: String(config.currency_symbol || '₪'),
    // بادئة رمز الطلب تُقرأ على الهاتف، فتُشتق من الاسم اللاتيني لا من المعرّف.
    order_code_prefix: String(config.short_name || 'ORD').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'ORD',
  };

  const columns = Object.keys(settings);
  const placeholders = columns.map(() => '?').join(', ');
  return [
    db.prepare(
      `INSERT INTO settings (restaurant_id, ${columns.join(', ')}, updated_at)
       VALUES (?, ${placeholders}, ?)`,
    ).bind(restaurantId, ...columns.map((key) => settings[key]), now),
  ];
}

/* ==================== نسخة العرض ==================== */

// الأيقونة قيمة رمزية من `icons.js` (`CATEGORY_ICONS`) لا إيموجي مباشر —
// نفس القاعدة التي تحكم اختيار الخط: معنى يُترجَم إلى أيقونة `lucide` عند
// العرض، لا نصّ حرّ قد يخرج عن حزمة الأيقونات الثلاثين المرفقة.
/**
 * صور النسخة التجريبية — أصول ثابتة يخدمها الـWorker، لا نسخ في R2 لكل مستأجر.
 *
 * لماذا ثابتة: كل مطعم تجريبي يعرض المنيو نفسه، فنسخ ٢٧ صورة في R2 لكل واحد
 * إنفاق بلا مقابل. صاحب المطعم يستبدلها برفع صوره متى شاء، فيصير `image_url`
 * رابط R2 خاصًّا به — هذه قيمة ابتدائية لا قيد.
 *
 * القوائم صريحة لا مبنيّة من مجلد: البذرة تعمل داخل Worker بلا نظام ملفات،
 * فلا سبيل لسؤال القرص أي صورة موجودة. مفتاح بلا صورة يعيد '' والتصميم
 * يعرض البطاقة بلا صورة — أفضل من رابط مكسور.
 *
 * الأصناف الناقصة عمدًا: لا صورة *صادقة* لها في المشاريع الثلاثة. جرّبتُ
 * أقربها ثم نظرتُ إلى النتيجة على الصفحة الحيّة فحذفتها: متبّل بصورة طبق
 * مقبلات فيه أصابع جبنة، ومشروب غازي بصورة عصائر، وبوظة بصورة موس شوكولاتة
 * — كلها يراها الزبون خطأً. بطاقة بلا صورة أنظف من بطاقة تكذب.
 */
const DEMO_IMAGES = {
  dish: new Set(['adana', 'arayes', 'burger', 'chickenshawarma', 'chops', 'coffee', 'fries',
    'hummus', 'kunafa', 'lemonmint', 'mixgrill', 'shawarma', 'shish']),
  offer: new Set(['breakfast', 'family', 'lunch', 'two']),
  category: new Set(['drinks', 'grill', 'mezze', 'sandwich', 'sweets']),
};

const demoImage = (kind, key) =>
  (DEMO_IMAGES[kind].has(key) ? `/site/img/demo/${kind}/${key}.webp` : '');

const CATEGORIES = [
  { key: 'grill', slug: 'grill', ar: 'المشاوي', en: 'Grills', icon: 'skewer' },
  { key: 'sandwich', slug: 'sandwiches', ar: 'الساندويتشات', en: 'Sandwiches', icon: 'burger' },
  { key: 'mezze', slug: 'mezze', ar: 'المقبلات', en: 'Mezze', icon: 'salad' },
  { key: 'drinks', slug: 'drinks', ar: 'المشروبات', en: 'Drinks', icon: 'drink' },
  { key: 'sweets', slug: 'sweets', ar: 'الحلويات', en: 'Sweets', icon: 'dessert' },
];

/**
 * الأصناف.
 *
 * `priced: false` صنف يُسعَّر عند التحضير — موجود عمدًا في البذرة لأنه الحالة
 * التي تكسر أي حساب يفترض أن كل سطر له رقم. العرض يجب أن يُظهرها تعمل.
 */
const ITEMS = [
  { key: 'adana', cat: 'grill', ar: 'كباب أضنة', en: 'Adana Kebab', price: 5500, old: 6500,
    dar: 'لحم مفروم متبّل بالفلفل الأحمر، مشوي على الفحم.', den: 'Spiced minced lamb, charcoal grilled.',
    featured: 1, badge_ar: 'الأشهر', badge_en: 'Signature',
    variants: [['وسط', 'Regular', 5500], ['كبير', 'Large', 7500]],
    addons: [['أرز إضافي', 'Extra rice', 800], ['صلصة حارة', 'Hot sauce', 300]] },
  { key: 'shish', cat: 'grill', ar: 'شيش طاووق', en: 'Shish Tawook', price: 4800,
    dar: 'دجاج متبّل بالثوم والليمون.', den: 'Garlic and lemon marinated chicken.',
    featured: 1, variants: [['وسط', 'Regular', 4800], ['كبير', 'Large', 6400]],
    addons: [['خبز إضافي', 'Extra bread', 200], ['ثومية', 'Garlic dip', 400]] },
  { key: 'mixgrill', cat: 'grill', ar: 'مشاوي مشكّلة', en: 'Mixed Grill', price: 9500,
    dar: 'كباب وشيش وكستليتا لشخصين.', den: 'Kebab, tawook and chops for two.', featured: 1 },
  { key: 'chops', cat: 'grill', ar: 'كستليتا غنم', en: 'Lamb Chops', price: 0, priced: false,
    price_note_ar: 'حسب وزن اليوم', price_note_en: 'Priced by weight',
    dar: 'تُسعَّر حسب الوزن عند التحضير.', den: 'Priced by the day’s weight.' },
  { key: 'kofta', cat: 'grill', ar: 'كفتة بالطحينة', en: 'Kofta Tahini', price: 5200,
    dar: 'كفتة بالفرن مع طحينة وبطاطا.', den: 'Oven kofta with tahini and potato.' },

  { key: 'shawarma', cat: 'sandwich', ar: 'شاورما لحم', en: 'Beef Shawarma', price: 2500,
    dar: 'شرائح لحم مع طحينة ومخلل.', den: 'Beef slices, tahini and pickles.', featured: 1,
    variants: [['عادي', 'Regular', 2500], ['دبل', 'Double', 3800]],
    addons: [['جبنة إضافية', 'Extra cheese', 500], ['بطاطا داخل', 'Fries inside', 400]] },
  { key: 'chickenshawarma', cat: 'sandwich', ar: 'شاورما دجاج', en: 'Chicken Shawarma', price: 2200,
    dar: 'دجاج مع ثومية ومخلل.', den: 'Chicken with garlic dip and pickles.',
    variants: [['عادي', 'Regular', 2200], ['دبل', 'Double', 3400]] },
  { key: 'burger', cat: 'sandwich', ar: 'برجر لحم', en: 'Beef Burger', price: 3200,
    dar: 'قطعة لحم ١٥٠غ مع جبنة شيدر.', den: '150g patty with cheddar.',
    addons: [['بيكون بقري', 'Beef bacon', 700], ['جبنة مزدوجة', 'Double cheese', 500]] },
  { key: 'falafel', cat: 'sandwich', ar: 'ساندويتش فلافل', en: 'Falafel Wrap', price: 900,
    dar: 'فلافل طازجة مع خضار وطحينة.', den: 'Fresh falafel, vegetables, tahini.' },
  { key: 'arayes', cat: 'sandwich', ar: 'عرايس لحم', en: 'Arayes', price: 2800,
    dar: 'خبز محشو لحم مفروم ومشوي.', den: 'Bread stuffed with minced meat, grilled.' },

  { key: 'hummus', cat: 'mezze', ar: 'حمّص بالطحينة', en: 'Hummus', price: 1200,
    dar: 'حمّص مطحون طازجًا مع زيت زيتون.', den: 'Fresh ground chickpeas, olive oil.' },
  { key: 'mutabal', cat: 'mezze', ar: 'متبّل باذنجان', en: 'Mutabal', price: 1400,
    dar: 'باذنجان مشوي مع طحينة ولبن.', den: 'Smoked aubergine, tahini, yoghurt.' },
  { key: 'tabbouleh', cat: 'mezze', ar: 'تبولة', en: 'Tabbouleh', price: 1500,
    dar: 'بقدونس وبرغل وطماطم وليمون.', den: 'Parsley, bulgur, tomato, lemon.' },
  { key: 'fries', cat: 'mezze', ar: 'بطاطا مقلية', en: 'French Fries', price: 1000,
    addons: [['صلصة جبنة', 'Cheese sauce', 400]] },
  { key: 'salad', cat: 'mezze', ar: 'سلطة عربية', en: 'Arabic Salad', price: 1100,
    dar: 'خضار مقطّعة مع ليمون وزيت.', den: 'Chopped vegetables, lemon, oil.' },

  { key: 'ayran', cat: 'drinks', ar: 'عيران', en: 'Ayran', price: 500 },
  { key: 'lemonmint', cat: 'drinks', ar: 'ليمون بالنعناع', en: 'Lemon Mint', price: 900,
    variants: [['كوب', 'Glass', 900], ['إبريق', 'Jug', 2200]] },
  { key: 'softdrink', cat: 'drinks', ar: 'مشروب غازي', en: 'Soft Drink', price: 400 },
  { key: 'tea', cat: 'drinks', ar: 'شاي تركي', en: 'Turkish Tea', price: 300 },
  { key: 'coffee', cat: 'drinks', ar: 'قهوة عربية', en: 'Arabic Coffee', price: 700 },

  { key: 'kunafa', cat: 'sweets', ar: 'كنافة نابلسية', en: 'Kunafa', price: 1800,
    dar: 'كنافة بالجبن مع قطر.', den: 'Cheese kunafa with syrup.', featured: 1,
    variants: [['قطعة', 'Slice', 1800], ['صينية صغيرة', 'Small tray', 6000]] },
  { key: 'baklava', cat: 'sweets', ar: 'بقلاوة بالفستق', en: 'Pistachio Baklava', price: 2000 },
  { key: 'rizbihaleeb', cat: 'sweets', ar: 'أرز بالحليب', en: 'Rice Pudding', price: 1200 },
  { key: 'icecream', cat: 'sweets', ar: 'بوظة عربية', en: 'Arabic Ice Cream', price: 1000 },
];

const OFFERS = [
  { key: 'family', ar: 'وجبة العائلة', en: 'Family Feast',
    dar: 'مشاوي مشكّلة + ٤ مقبلات + ٤ مشروبات.', den: 'Mixed grill + 4 mezze + 4 drinks.',
    price: 19900, old_ar: '٢٦٠.٠٠ ₪', old_en: '260.00 ₪', priced: true },
  { key: 'two', ar: 'اثنان بسعر واحد', en: 'Two for One',
    dar: 'كل شاورما لحم ثانية مجانًا، الثلاثاء فقط.', den: 'Second beef shawarma free, Tuesdays only.',
    price_ar: '٢ بسعر ١', price_en: '2 for 1' },
  { key: 'lunch', ar: 'غداء الموظفين', en: 'Lunch Deal',
    dar: 'ساندويتش + بطاطا + مشروب، من ١٢ إلى ٤.', den: 'Sandwich + fries + drink, 12 to 4.',
    price: 3500, priced: true },
  { key: 'breakfast', ar: 'فطور الجمعة', en: 'Friday Breakfast',
    dar: 'مائدة مفتوحة للفرد، حتى ١١ صباحًا.', den: 'Open buffet per person, until 11 AM.',
    price: 4500, priced: true },
];

const SERVICES = [
  { key: 'delivery', ar: 'توصيل سريع', en: 'Fast Delivery', icon: 'scooter',
    dar: 'داخل المدينة خلال ٤٥ دقيقة.', den: 'Within the city in 45 minutes.' },
  { key: 'catering', ar: 'خدمة المناسبات', en: 'Catering', icon: 'dine',
    dar: 'أعراس ومناسبات حتى ٣٠٠ ضيف.', den: 'Weddings and events up to 300 guests.' },
  { key: 'family', ar: 'قسم عائلي', en: 'Family Section', icon: 'leaf',
    dar: 'طابق كامل مخصص للعائلات.', den: 'A full floor for families.' },
  { key: 'parking', ar: 'موقف مجاني', en: 'Free Parking', icon: 'clock',
    dar: 'موقف خاص أمام المطعم.', den: 'Private parking at the door.' },
];

const TESTIMONIALS = [
  { key: 't1', name: 'أحمد الشوا', rating: 5,
    ar: 'أفضل كباب جرّبته في المدينة. الطلب وصل ساخنًا وقبل الوقت.',
    en: 'Best kebab in town. Arrived hot and early.' },
  { key: 't2', name: 'ليلى منصور', rating: 5,
    ar: 'حجزت لعيد ميلاد ابنتي وكان الاستقبال ممتازًا.',
    en: 'Booked for my daughter’s birthday, wonderful hosting.' },
  { key: 't3', name: 'خالد أبو ندى', rating: 4,
    ar: 'الطعم ثابت من سنتين. المقبلات تستحق وحدها.',
    en: 'Consistent for two years. The mezze alone is worth it.' },
  { key: 't4', name: 'سماح درويش', rating: 5,
    ar: 'طلبت لمكتبنا ١٥ وجبة ووصلت مرتّبة ومعلّمة بالأسماء.',
    en: 'Ordered 15 meals for the office, all labelled and neat.' },
  { key: 't5', name: 'يوسف حرب', rating: 5,
    ar: 'الكنافة هنا تُطلب لوحدها. أوصي بها.',
    en: 'The kunafa is worth a trip on its own.' },
];

const FAQS = [
  { key: 'f1', qar: 'ما مناطق التوصيل؟', qen: 'Where do you deliver?',
    aar: 'نوصّل داخل المدينة وضواحيها القريبة، والرسوم تظهر عند التأكيد.',
    aen: 'We deliver across the city and nearby suburbs; the fee is shown at confirmation.' },
  { key: 'f2', qar: 'كم يستغرق الطلب؟', qen: 'How long does an order take?',
    aar: 'من ٢٥ إلى ٤٥ دقيقة حسب الازدحام.', aen: '25 to 45 minutes depending on load.' },
  { key: 'f3', qar: 'هل يمكن الحجز لمناسبة كبيرة؟', qen: 'Can I book for a large event?',
    aar: 'نعم، تواصل معنا قبل ٤٨ ساعة على الأقل.', aen: 'Yes, please contact us at least 48 hours ahead.' },
  { key: 'f4', qar: 'هل لديكم خيارات نباتية؟', qen: 'Do you have vegetarian options?',
    aar: 'كل المقبلات نباتية، وكذلك ساندويتش الفلافل.', aen: 'All mezze are vegetarian, as is the falafel wrap.' },
  { key: 'f5', qar: 'كيف أدفع؟', qen: 'How do I pay?',
    aar: 'نقدًا عند الاستلام حاليًا.', aen: 'Cash on delivery for now.' },
  { key: 'f6', qar: 'هل اللحم حلال؟', qen: 'Is the meat halal?',
    aar: 'كل لحومنا حلال ومن موردين معتمدين.', aen: 'All our meat is halal from certified suppliers.' },
];

const HERO_STATS = [
  { key: 's1', ar: '١٢ عامًا من الخبرة', en: '12 years of experience', icon: 'crown' },
  { key: 's2', ar: 'أكثر من ٤٠ صنفًا', en: 'Over 40 dishes', icon: 'star' },
  { key: 's3', ar: 'توصيل خلال ٤٥ دقيقة', en: 'Delivery in 45 minutes', icon: 'clock' },
  { key: 's4', ar: 'لحوم حلال معتمدة', en: 'Certified halal meat', icon: 'leaf' },
];

/** حجوزات موزّعة على الحالات والأيام: لوحة فارغة لا تبيع منتجًا. */
const RESERVATIONS = [
  { key: 'r1', name: 'محمود العف', phone: '0599100001', day: 0, time: '20:00', guests: 4, status: 'confirmed', occasion: 'عشاء عائلي' },
  { key: 'r2', name: 'رنا القدرة', phone: '0599100002', day: 0, time: '21:00', guests: 2, status: 'new', occasion: 'ذكرى زواج' },
  { key: 'r3', name: 'سامي أبو شرخ', phone: '0599100003', day: 1, time: '19:30', guests: 6, status: 'confirmed', occasion: '' },
  { key: 'r4', name: 'هبة النجار', phone: '0599100004', day: 1, time: '20:30', guests: 3, status: 'contacted', occasion: 'عيد ميلاد' },
  { key: 'r5', name: 'عمر صيام', phone: '0599100005', day: 2, time: '18:00', guests: 8, status: 'new', occasion: 'اجتماع عمل' },
  { key: 'r6', name: 'دعاء الهمص', phone: '0599100006', day: 2, time: '21:30', guests: 2, status: 'cancelled', occasion: '' },
  { key: 'r7', name: 'زياد البطش', phone: '0599100007', day: 3, time: '19:00', guests: 5, status: 'new', occasion: 'تخرج' },
  { key: 'r8', name: 'أمل شاهين', phone: '0599100008', day: 4, time: '20:00', guests: 10, status: 'confirmed', occasion: 'خطوبة' },
];

/**
 * طلبات على مدى أسبوع.
 *
 * موزّعة على الحالات ومصدرَي الطلب (الموقع والكاشير) وعلى أيام مختلفة، لأن
 * لوحة التشغيل تعرض «اليوم» و«الأسبوع»، ولوحة بأرقام صفرية لا تُظهر قيمة.
 */
const ORDERS = [
  { key: 'o1', code: 'A7K2', day: 0, hour: 13, status: 'new', ful: 'delivery', src: 'online',
    name: 'يوسف الشوا', phone: '0599200001', address: 'شارع الوحدة، عمارة النور',
    notes: 'بدون بصل من فضلك',
    lines: [['shawarma', 2, 'عادي', ['جبنة إضافية']], ['fries', 1, '', []]] },
  { key: 'o2', code: 'B3M9', day: 0, hour: 14, status: 'preparing', ful: 'pickup', src: 'online',
    name: 'نور الدين', phone: '0599200002',
    lines: [['adana', 1, 'كبير', ['أرز إضافي']], ['ayran', 2, '', []]] },
  { key: 'o3', code: 'C8P4', day: 0, hour: 14, status: 'confirmed', ful: 'dine_in', src: 'cashier',
    name: 'طاولة ٧', table: '7', count: 4,
    lines: [['mixgrill', 1, '', []], ['hummus', 2, '', []], ['lemonmint', 1, 'إبريق', []]] },
  { key: 'o4', code: 'D2R7', day: 0, hour: 15, status: 'delivered', ful: 'delivery', src: 'online',
    name: 'سلمى عاشور', phone: '0599200004', address: 'حي الرمال، شارع ٨',
    lines: [['chickenshawarma', 3, 'عادي', []], ['softdrink', 3, '', []]] },
  { key: 'o5', code: 'E5T1', day: 1, hour: 19, status: 'delivered', ful: 'delivery', src: 'online',
    name: 'باسل مطر', phone: '0599200005', address: 'تل الهوا، برج الأندلس',
    lines: [['burger', 2, '', ['بيكون بقري']], ['fries', 2, '', ['صلصة جبنة']], ['softdrink', 2, '', []]] },
  { key: 'o6', code: 'F9V6', day: 1, hour: 20, status: 'delivered', ful: 'dine_in', src: 'cashier',
    name: 'طاولة ٣', table: '3', count: 2,
    lines: [['shish', 2, 'وسط', ['ثومية']], ['tabbouleh', 1, '', []], ['kunafa', 2, 'قطعة', []]] },
  { key: 'o7', code: 'G4W8', day: 2, hour: 13, status: 'delivered', ful: 'pickup', src: 'online',
    name: 'إياد حمدان', phone: '0599200007',
    lines: [['arayes', 4, '', []], ['ayran', 4, '', []]] },
  { key: 'o8', code: 'H6X3', day: 2, hour: 21, status: 'cancelled', ful: 'delivery', src: 'online',
    name: 'مروة زقوت', phone: '0599200008', address: 'النصر، مقابل الحديقة',
    notes: 'اتصلت وألغت الطلب',
    lines: [['kofta', 1, '', []]] },
  { key: 'o9', code: 'J1Y5', day: 3, hour: 14, status: 'delivered', ful: 'dine_in', src: 'cashier',
    name: 'طاولة ١٢', table: '12', count: 6,
    lines: [['chops', 2, '', []], ['mutabal', 2, '', []], ['salad', 2, '', []], ['tea', 6, '', []]] },
  { key: 'o10', code: 'K7Z2', day: 4, hour: 18, status: 'delivered', ful: 'delivery', src: 'online',
    name: 'رامي الأسطل', phone: '0599200010', address: 'الزيتون، شارع صلاح الدين',
    lines: [['adana', 2, 'وسط', []], ['hummus', 1, '', []], ['baklava', 1, '', []]] },
  { key: 'o11', code: 'L3A9', day: 5, hour: 20, status: 'delivered', ful: 'pickup', src: 'online',
    name: 'دينا صرصور', phone: '0599200011',
    lines: [['falafel', 6, '', []], ['fries', 2, '', []]] },
  { key: 'o12', code: 'M8B4', day: 6, hour: 19, status: 'delivered', ful: 'dine_in', src: 'cashier',
    name: 'طاولة ٥', table: '5', count: 3,
    lines: [['mixgrill', 1, '', []], ['kunafa', 1, 'صينية صغيرة', []], ['coffee', 3, '', []]] },
];

export function demoSeedStatements(db, restaurantId, now, displayName = 'مطعم العرض') {
  const out = [];
  const itemById = new Map();

  // الإعدادات: نستبدل ما كتبته النسخة الافتراضية بهوية مطعم حقيقي المظهر.
  out.push(db.prepare(
    `UPDATE settings SET
      tagline_ar = ?, tagline_en = ?,
      hero_title_ar = ?, hero_title_en = ?, hero_text_ar = ?, hero_text_en = ?,
      about_text_ar = ?, about_text_en = ?,
      whatsapp_number = ?, phone = ?, email = ?,
      address_ar = ?, address_en = ?,
      instagram_url = ?, facebook_url = ?,
      hero_image_url = ?, og_image_url = ?,
      updated_at = ?
     WHERE restaurant_id = ?`,
  ).bind(
    'على الفحم منذ ٢٠١٣', 'Charcoal grilled since 2013',
    'نكهة الفحم كما يجب أن تكون', 'Charcoal, the way it should be',
    'مشاوي طازجة يوميًا، ومقبلات تُحضَّر عند الطلب.',
    'Fresh grills daily, mezze made to order.',
    'بدأنا بعربة صغيرة وثلاثة أصناف. اليوم نخدم أكثر من ٤٠ صنفًا، ولم نغيّر '
      + 'شيئًا في الطريقة: فحم حقيقي، لحم يُفرم كل صباح، وتتبيلة لم تتبدّل منذ اليوم الأول.',
    'We started with a small cart and three dishes. Today we serve over 40, with the same '
      + 'method: real charcoal, meat minced each morning, and a marinade unchanged since day one.',
    '970599123456', '+970 59 912 3456', 'hello@example.com',
    'غزة — شارع الوحدة، مقابل حديقة البلدية', 'Gaza — Al Wehda St., opposite the municipal park',
    'https://instagram.com/', 'https://facebook.com/',
    '/site/img/demo/hero.webp', '/site/img/demo/hero.webp',
    now, restaurantId,
  ));

  HERO_STATS.forEach((stat, index) => out.push(db.prepare(
    `INSERT INTO hero_stats (id, restaurant_id, title_ar, title_en, icon, display_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(sid(restaurantId, 'hs', stat.key), restaurantId, stat.ar, stat.en, stat.icon, index, now)));

  CATEGORIES.forEach((category, index) => out.push(db.prepare(
    `INSERT INTO categories (id, restaurant_id, name_ar, name_en, slug, icon, image_url, display_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(sid(restaurantId, 'cat', category.key), restaurantId, category.ar, category.en,
    category.slug, category.icon, demoImage('category', category.key), index, now)));

  ITEMS.forEach((item, index) => {
    const id = sid(restaurantId, 'item', item.key);
    itemById.set(item.key, item);
    out.push(db.prepare(
      `INSERT INTO menu_items
       (id, restaurant_id, category_id, name_ar, name_en, description_ar, description_en,
        price_minor, old_price_minor, is_priced, badge_ar, badge_en, is_featured, is_available,
        image_url, display_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(
      id, restaurantId, sid(restaurantId, 'cat', item.cat), item.ar, item.en,
      item.dar || '', item.den || '', item.price || 0, item.old || 0,
      item.priced === false ? 0 : 1, item.badge_ar || '', item.badge_en || '',
      item.featured || 0, demoImage('dish', item.key), index, now,
    ));
    (item.variants || []).forEach(([ar, en, price], order) => out.push(db.prepare(
      `INSERT INTO menu_item_variants
       (id, restaurant_id, menu_item_id, name_ar, name_en, price_minor, display_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(sid(restaurantId, 'var', `${item.key}_${order}`), restaurantId, id, ar, en, price, order, now)));
    (item.addons || []).forEach(([ar, en, price], order) => out.push(db.prepare(
      `INSERT INTO menu_item_addons
       (id, restaurant_id, menu_item_id, name_ar, name_en, price_minor, display_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(sid(restaurantId, 'add', `${item.key}_${order}`), restaurantId, id, ar, en, price, order, now)));
  });

  OFFERS.forEach((offer, index) => out.push(db.prepare(
    `INSERT INTO offers
     (id, restaurant_id, title_ar, title_en, description_ar, description_en,
      price_text_ar, price_text_en, old_price_text_ar, old_price_text_en,
      price_minor, is_priced, image_url, display_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(
    sid(restaurantId, 'off', offer.key), restaurantId, offer.ar, offer.en, offer.dar, offer.den,
    offer.price_ar || '', offer.price_en || '', offer.old_ar || '', offer.old_en || '',
    offer.price || 0, offer.priced ? 1 : 0, demoImage('offer', offer.key), index, now,
  )));

  SERVICES.forEach((service, index) => out.push(db.prepare(
    `INSERT INTO services
     (id, restaurant_id, title_ar, title_en, description_ar, description_en, icon,
      display_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(sid(restaurantId, 'srv', service.key), restaurantId, service.ar, service.en,
    service.dar, service.den, service.icon, index, now)));

  TESTIMONIALS.forEach((review, index) => out.push(db.prepare(
    `INSERT INTO testimonials
     (id, restaurant_id, customer_name, review_ar, review_en, rating, display_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(sid(restaurantId, 'rev', review.key), restaurantId, review.name, review.ar, review.en,
    review.rating, index, now)));

  FAQS.forEach((faq, index) => out.push(db.prepare(
    `INSERT INTO faqs
     (id, restaurant_id, question_ar, question_en, answer_ar, answer_en, display_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(sid(restaurantId, 'faq', faq.key), restaurantId, faq.qar, faq.qen, faq.aar, faq.aen, index, now)));

  // الحجوزات في المستقبل القريب: حجز أمس ليس دليلًا على أن الميزة تعمل.
  const isoDay = (offset) => new Date(now + offset * DAY).toISOString().slice(0, 10);
  RESERVATIONS.forEach((reservation, index) => out.push(db.prepare(
    `INSERT INTO reservations
     (id, restaurant_id, full_name, phone, date, time, guests, occasion, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
  ).bind(
    sid(restaurantId, 'res', reservation.key), restaurantId, reservation.name, reservation.phone,
    isoDay(reservation.day + 1), reservation.time, reservation.guests, reservation.occasion,
    reservation.status, now - (RESERVATIONS.length - index) * 3600e3, now,
  )));

  // الطلبات إلى الوراء: «اليوم» و«هذا الأسبوع» في لوحة التشغيل تحتاج ماضيًا.
  ORDERS.forEach((order) => {
    const orderId = sid(restaurantId, 'ord', order.key);
    const createdAt = now - order.day * DAY - (24 - order.hour) * 3600e3;
    let total = 0;
    let unpriced = 0;
    const lineStatements = [];

    order.lines.forEach(([itemKey, quantity, variantName, addonNames], index) => {
      const item = itemById.get(itemKey);
      const variant = (item.variants || []).find(([ar]) => ar === variantName);
      const addons = (addonNames || []).map((name) => {
        const found = (item.addons || []).find(([ar]) => ar === name);
        return { name_ar: name, price_minor: found ? found[2] : 0 };
      });
      const base = variant ? variant[2] : (item.price || 0);
      const unit = base + addons.reduce((sum, addon) => sum + addon.price_minor, 0);
      const priced = item.priced === false ? 0 : 1;
      if (priced) total += unit * quantity; else unpriced = 1;
      lineStatements.push(db.prepare(
        `INSERT INTO order_lines
         (id, restaurant_id, order_id, menu_item_id, variant_name_ar, addons_json,
          name_ar, name_en, quantity, unit_price_minor, is_priced, price_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        sid(restaurantId, 'oln', `${order.key}_${index}`), restaurantId, orderId,
        sid(restaurantId, 'item', itemKey), variantName || '', JSON.stringify(addons),
        item.ar, item.en, quantity, priced ? unit : 0, priced,
        priced ? '' : (item.price_note_ar || 'حسب الطلب'), createdAt,
      ));
    });

    out.push(db.prepare(
      `INSERT INTO orders
       (id, restaurant_id, code, token, status, fulfillment, source, customer_name, customer_count,
        table_number, phone, address, notes, total_minor, currency, has_unpriced_lines,
        restaurant_name, restaurant_tagline, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '₪', ?, ?, ?, 'ar', ?, ?)`,
    ).bind(
      orderId, restaurantId, `DEMO-${order.code}`,
      `${restaurantId.toLowerCase()}-${order.key}-${order.code.toLowerCase()}`,
      order.status, order.ful, order.src, order.name, order.count || 1,
      order.table || '', order.phone || '', order.address || '', order.notes || '',
      total, unpriced, displayName, 'على الفحم منذ ٢٠١٣', createdAt, createdAt,
    ));
    out.push(...lineStatements);
  });

  return out;
}
