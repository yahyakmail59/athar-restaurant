/**
 * الموقع العام — منقول حرفيًا عن قوالب Django في مشروع أضنة (base.html،
 * home.html، menu.html، order_detail.html)، مع إبقاء CSS وJS كما هما بلا
 * تعديل. الترجمة هنا تقتصر على HTML: نفس الأصناف، نفس التعشيش، نفس ترتيب
 * الأقسام — لأن `site/js/main.js` المنسوخ حرفيًا يقرأ الصفحة بمعرّفات
 * وأصناف محدَّدة، ولن يعمل إن اختلف الهيكل عمّا يتوقعه.
 *
 * فرق واحد متعمَّد عن أضنة: لا Django Sessions هنا، فرسائل الحجز والطلب
 * تظهر عبر معامل استعلام + سكربت صغير بدل إطار `messages` الجاهز.
 *
 * لماذا SSR: الصفحة تُفتح من نتيجة بحث أو رابط واتساب، وأول ما يصل يجب أن
 * يكون الصفحة نفسها لا هيكلًا فارغًا ينتظر طلبًا ثانيًا.
 */

import { escapeHtml, money, safeColor } from './lib.js';
import { fontUrl, stack, ARABIC_FONTS, ARABIC_DISPLAY_FONTS, DISPLAY_FONTS, LATIN_FONTS,
  DEFAULT_ARABIC, DEFAULT_ARABIC_DISPLAY, DEFAULT_DISPLAY, DEFAULT_LATIN } from './fonts.js';
import { rgbTriplet, inkFor } from './colors.js';
import { heroStatLucide, categoryLucide, serviceLucide } from './icons.js';

/** نص ثنائي اللغة: العربية لا تسقط أبدًا إلى الإنجليزية، والإنجليزية تسقط إلى العربية عند الفراغ. */
const bi = (row, base, lang) => {
  const ar = String(row?.[`${base}_ar`] ?? '').trim();
  const en = String(row?.[`${base}_en`] ?? '').trim();
  return lang === 'ar' ? ar : (en || ar);
};

/** التسمية الصغيرة المقلوبة تحت العناوين — أضنة يظهرها بأحرف كبيرة حين تكون لاتينية. */
const miniLabel = (row, base, lang) => {
  const ar = String(row?.[`${base}_ar`] ?? '').trim();
  const en = String(row?.[`${base}_en`] ?? '').trim();
  return lang === 'ar' ? en.toUpperCase() : ar;
};

const priceText = (minor) => (Number(minor || 0) / 100).toFixed(2);
const truncate = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
const on = (value) => Number(value) === 1;

/* ==================== الخطوط والألوان ==================== */

function fontStacks(settings) {
  return {
    arabic: stack(ARABIC_FONTS, settings.arabic_font, DEFAULT_ARABIC),
    arabicDisplay: stack(ARABIC_DISPLAY_FONTS, settings.arabic_display_font, DEFAULT_ARABIC_DISPLAY),
    display: stack(DISPLAY_FONTS, settings.display_font, DEFAULT_DISPLAY),
    latin: stack(LATIN_FONTS, settings.latin_font, DEFAULT_LATIN),
  };
}

/** أنماط `:root` المحقونة — القيم فقط، والأصل كله في `style.css` المنسوخ حرفيًا. */
const LINE_ON_DARK = 'rgba(255,255,255,.14)';
const LINE_ON_LIGHT = 'rgba(34,34,34,.18)';

/** هل هذا النصّ فاتح — أي أرضيته داكنة؟ */
function onLight(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.5;
}

/**
 * لون حدٍّ آمن.
 *
 * `safeColor` تقبل `#rrggbb` وحدها، وحدود الهوية شفافة بطبعها —
 * `rgba(255,255,255,.14)` على الداكن. فتُقبل هنا بشكل مقيّد: أرقام
 * وفواصل ونقطة داخل `rgba()` لا غير، فلا يمرّ منها ما يكسر الورقة.
 */
function safeLine(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/.test(raw)) return raw;
  return fallback;
}

function rootVars(settings) {
  const primary = safeColor(settings.primary_color, '#E30613');
  const gold = safeColor(settings.gold_color, '#D4AF37');
  const bg = safeColor(settings.background_color, '#050505');
  const surface = safeColor(settings.surface_color, '#111111');
  const wa = safeColor(settings.whatsapp_color, '#25D366');
  const text = safeColor(settings.text_color, '#FFFFFF');
  const muted = safeColor(settings.muted_color, '#B8B8B8');
  // الحدّ قد يكون `rgba(...)` لا `#rrggbb`، فلا يمرّ بـ`safeColor`.
  // يُقبل شكلًا محدودًا: أرقام وفواصل ونقطة داخل `rgba()` وحدها.
  const line = safeLine(settings.line_color, onLight(text) ? LINE_ON_LIGHT : LINE_ON_DARK);
  const fonts = fontStacks(settings);
  return `:root{
--brand-red:${primary};
--brand-rgb:${rgbTriplet(primary, '#E30613')};
--brand-ink:${inkFor(primary, '#E30613')};
--brand-gold:${gold};
--brand-gold-rgb:${rgbTriplet(gold, '#D4AF37')};
--page-bg:${bg};
--surface:${surface};
--whatsapp:${wa};
--whatsapp-ink:${inkFor(wa, '#25D366')};
--text:${text};
--muted:${muted};
--line:${line};
--display:${fonts.display};
--arabic:${fonts.arabic};
--arabic-display:${fonts.arabicDisplay};
--latin:${fonts.latin};
}`;
}

/**
 * أنماط أثر وحدها — ما لا مقابل له في `style.css`.
 *
 * وكان هنا أن الملف يبقى مطابقًا لأضنة بايتًا ببايت فتُقارن ترقياته لاحقًا.
 * تُركت القاعدة عمدًا: أضنة مشروع Django متوقّف ولا ترقيات تأتي منه
 * لتُقارَن، وثمنُها كان أن يبقى المحرك داكنًا إلى الأبد. فصار `style.css`
 * مُرمَّزًا بالدور، والوضع الفاتح طبقةً فوقه.
 *
 * ويبقى الحقن هنا لهذه القاعدة وحدها: `.footer-bottom` أصلًا
 * `space-between`، فزرّ الإدارة يقف في الطرف المقابل لحقوق النشر بلا
 * تعديل في التخطيط.
 */
const ATHAR_CSS = '.footer-admin{display:inline-flex;align-items:center;gap:6px;'
  + 'font:500 .62rem var(--latin);color:var(--muted);text-decoration:none;opacity:.75;'
  + 'transition:color .2s,opacity .2s}'
  + '.footer-admin:hover,.footer-admin:focus-visible{color:var(--brand-gold);opacity:1}'
  + '.footer-admin svg{flex:none}';

/** طبقة الثيم الإضافية — تُحمَّل فوق `style.css` ولا تعدّله. */
const THEME_LAYERS = {
  luxury: '/site/css/themes/luxury.css',
  light: '/site/css/themes/light.css',
};
const themeLayerHref = (settings) => THEME_LAYERS[String(settings.theme_layer || '')] || '';

/* ==================== الهيكل (base.html) ==================== */

const waHref = (settings, text) => {
  const number = digitsOnly(settings.whatsapp_number);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text || '')}` : '';
};

/**
 * الوسم الوصفي Schema.org — منقول حرفيًا. مفيد لمحركات البحث ولا أثر له في
 * الصفحة المرئية، فحذفه رخيص ولا يكسر شيئًا؛ إبقاؤه أرخص من حذفه.
 */
function schemaOrgTag(settings, lang, homeUrl) {
  const name = bi(settings, 'name', lang);
  const altName = bi(settings, 'name', lang === 'ar' ? 'en' : 'ar');
  const description = bi(settings, 'seo_description', lang) || bi(settings, 'hero_text', lang);
  const sameAs = [settings.instagram_url, settings.facebook_url].filter(Boolean);
  const payload = {
    '@context': 'https://schema.org', '@type': 'Restaurant',
    name, alternateName: altName, description,
    ...(homeUrl ? { url: homeUrl } : {}),
    ...(settings.og_image_url ? { image: settings.og_image_url } : {}),
    telephone: settings.phone || '',
    servesCuisine: ['Middle Eastern', 'International'], priceRange: '$$',
    ...(sameAs.length ? { sameAs } : {}),
    address: { '@type': 'PostalAddress', streetAddress: bi(settings, 'address', lang), addressCountry: 'PS' },
  };
  // JSON داخل <script> لا HTML: يُهرَّب بخصائص JSON نفسها لا escapeHtml، فلا
  // يُكسَر بعلامة اقتباس مضاعفة، ولا يفتح وسم `</script>` مبكرًا لو ظهر في نص حر.
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

/**
 * `base` هو مسار المطعم المطلق (`/r/{slug}/`) لا نصًّا فارغًا.
 *
 * كان يُمرَّر `''`، فصار رابط «الرئيسية» في صفحة المنيو `href=""` — وهو إعادة
 * تحميل الصفحة نفسها لا انتقالًا — و«اتصل بنا» يشير إلى `#contact` وهو قسم
 * لا وجود له خارج الصفحة الرئيسية. رابطان ميتان في ترويسة كل صفحة منيو.
 */
/**
 * مسار المطعم مضمونًا بشرطة مائلة أخيرة.
 *
 * الصفحة تُخدم بشرطة وبدونها معًا (كلاهما 200 بلا تحويل)، وكل عنوان نسبي
 * ينكسر على الشكل الذي بلا شرطة لأن المتصفح يُسقط آخر مقطع. فكل رابط في
 * القالب يُبنى على هذه القيمة لا على مسار الصفحة الحالية.
 */
const withSlash = (base) => (String(base || '/').endsWith('/') ? String(base || '/') : `${base}/`);

function headerNav(base, lang, settings, isMenuPage, bestSellers, offers) {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  if (isMenuPage) {
    return `<a href="${base}">${t('<b>الرئيسية</b><small>HOME</small>', '<b>Home</b><small>الرئيسية</small>')}</a>
<a class="active" href="#menu-top" aria-current="location">${t('<b>المنيو</b><small>MENU</small>', '<b>Menu</b><small>المنيو</small>')}</a>
<a href="#menu-catalog">${t('<b>كل الأصناف</b><small>ALL DISHES</small>', '<b>All dishes</b><small>كل الأصناف</small>')}</a>
${bestSellers.length ? `<a href="#menu-best">${t('<b>الأكثر طلبًا</b><small>BEST SELLERS</small>', '<b>Best sellers</b><small>الأكثر طلبًا</small>')}</a>` : ''}
${offers.length ? `<a href="#menu-offers">${t('<b>العروض</b><small>OFFERS</small>', '<b>Offers</b><small>العروض</small>')}</a>` : ''}
<a href="${base}#contact">${t('<b>اتصل بنا</b><small>CONTACT</small>', '<b>Contact</b><small>اتصل بنا</small>')}</a>`;
  }
  return `<a class="active" href="#hero" aria-current="location">${t('<b>الرئيسية</b><small>HOME</small>', '<b>Home</b><small>الرئيسية</small>')}</a>
${on(settings.show_featured) ? `<a href="#menu">${t('<b>القائمة</b><small>MENU</small>', '<b>Menu</b><small>القائمة</small>')}</a>` : ''}
${on(settings.show_offers) ? `<a href="#offers">${t('<b>العروض</b><small>OFFERS</small>', '<b>Offers</b><small>العروض</small>')}</a>` : ''}
${on(settings.show_reservation) ? `<a href="#contact">${t('<b>اتصل بنا</b><small>CONTACT</small>', '<b>Contact</b><small>اتصل بنا</small>')}</a>` : ''}
${on(settings.show_about) ? `<a href="#about">${t('<b>من نحن</b><small>ABOUT US</small>', '<b>About us</b><small>من نحن</small>')}</a>` : ''}`;
}

/**
 * الهيكل الخارجي: رأس، سلة عائمة، درج الطلب، نافذة تفاصيل الطبق، تذييل
 * التنقل السفلي. كل معرّف هنا يقرؤه `main.js` بالاسم، فلا يُغيَّر بلا داعٍ.
 */
export function layout({ settings, lang, title, description, body, canonical = '', homeUrl = '',
  base = '/', isMenuPage = false, bestSellers = [], offers = [] }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const themeLayer = themeLayerHref(settings);
  const fonts = fontStacks(settings);
  void fonts;
  // مسار مطلق مبنيّ على `base` (وهو `/r/{slug}/`)، لا نسبي ولا مشتقّ من
  // `homeUrl`. سببان:
  //  - نسبيًّا (`order/`) يُحلّ على مسار الصفحة: يصيب من الرئيسية ويصير
  //    `/menu/order/` من صفحة المنيو فيردّ 405، وهي الصفحة التي يطلب منها
  //    أكثر الزبائن.
  //  - `homeUrl` لا تمرّره `renderMenu`، فالاعتماد عليه يعطي `/order/` بلا
  //    اسم المطعم فيسقط الطلب من *كل* صفحة. `base` تمرّره الصفحتان كلتاهما.
  const baseUrl = withSlash(base);
  const orderUrlAttr = `${baseUrl}order/`;
  const menuUrlAttr = `${baseUrl}menu/`;
  const name = bi(settings, 'name', lang);

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="${escapeHtml(safeColor(settings.background_color, '#050505'))}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
${settings.og_image_url ? `<meta property="og:image" content="${escapeHtml(settings.og_image_url)}">` : ''}
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
<title>${escapeHtml(title)}</title>
<script type="application/ld+json">${schemaOrgTag(settings, lang, homeUrl)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${escapeHtml(fontUrl(settings.arabic_font, settings.display_font, settings.latin_font, settings.arabic_display_font))}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link href="${escapeHtml(fontUrl(settings.arabic_font, settings.display_font, settings.latin_font, settings.arabic_display_font))}" rel="stylesheet"></noscript>
<link rel="stylesheet" href="/site/css/style.css">
${themeLayer ? `<link rel="stylesheet" href="${themeLayer}">` : ''}
<style>${rootVars(settings)}${ATHAR_CSS}</style>
<script src="/site/js/lucide-slim.js" defer></script>
<script src="/site/js/main.js" defer></script>
</head>
<body${isMenuPage ? ' class="menu-page-body"' : ''} data-lang="${lang}" data-whatsapp="${escapeHtml(digitsOnly(settings.whatsapp_number))}" data-currency="${escapeHtml(settings.currency || '₪')}" data-order-url="${escapeHtml(orderUrlAttr)}">
<a class="skip-link" href="#main">${t('انتقل إلى المحتوى', 'Skip to content')}</a>

<header class="site-header" id="top">
<div class="page-shell header-inner">
<a class="brand" href="${escapeHtml(baseUrl)}" aria-label="${escapeHtml(name)}">
${settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(name)}" width="890" height="810">`
    : `<span class="brand-wordmark">${escapeHtml(name)}</span>`}
</a>
<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav"
 data-open-label="${t('فتح القائمة', 'Open menu')}" data-close-label="${t('إغلاق القائمة', 'Close menu')}"
 aria-label="${t('فتح القائمة', 'Open menu')}">
<i class="nav-icon-menu" data-lucide="menu" aria-hidden="true"></i>
<i class="nav-icon-close" data-lucide="x" aria-hidden="true"></i>
</button>
<nav id="main-nav" class="main-nav" aria-label="${t('التنقل الرئيسي', 'Primary navigation')}">
${headerNav(baseUrl, lang, settings, isMenuPage, bestSellers, offers)}
</nav>
<div class="header-actions">
<div class="language-switch" role="group" aria-label="${t('اختيار اللغة', 'Choose language')}">
<a href="?lang=ar" class="${lang === 'ar' ? 'active' : ''}">AR</a><span>|</span><a href="?lang=en" class="${lang === 'en' ? 'active' : ''}">EN</a>
</div>
<button class="header-whatsapp js-open-cart" type="button" aria-label="${t('عرض سلة الطلب', 'View order cart')}">
<i data-lucide="shopping-cart"></i>
<span><b>${escapeHtml(bi(settings, 'order_cta', lang))}</b><small>${escapeHtml(bi(settings, 'order_cta', lang === 'ar' ? 'en' : 'ar'))}</small></span>
<em class="cart-count">0</em>
</button>
</div>
</div>
</header>

<div id="flash-message" class="messages page-shell" role="status" hidden></div>

<main id="main">${body}</main>

<div class="cart-feedback" id="cart-feedback" role="status" aria-live="polite"></div>

<button class="floating-whatsapp js-open-cart" type="button" aria-label="${t('عرض سلة الطلب', 'View order cart')}">
<i data-lucide="shopping-cart"></i><span class="floating-count">0</span>
</button>

<nav class="bottom-nav" aria-label="${t('تنقّل سريع', 'Quick navigation')}">
<a href="./" class="bottom-nav-item${isMenuPage ? '' : ' active'}">
<i data-lucide="home"></i><span>${t('الرئيسية', 'Home')}</span>
</a>
${on(settings.show_featured) ? `<a href="${isMenuPage ? './' : 'menu/'}" class="bottom-nav-item${isMenuPage ? ' active' : ''}">
<i data-lucide="notebook-tabs"></i><span>${t('المنيو', 'Menu')}</span>
</a>
<a href="menu/?focus=search" class="bottom-nav-item js-nav-search">
<i data-lucide="search"></i><span>${t('بحث', 'Search')}</span>
</a>` : ''}
<button type="button" class="bottom-nav-item js-open-cart">
<span class="bottom-nav-cart-icon"><i data-lucide="shopping-cart"></i><em class="bottom-nav-badge" id="bottom-nav-cart-count" hidden>0</em></span>
<span>${t('طلبك', 'Order')}</span>
</button>
</nav>

<button class="sticky-cart-bar js-open-cart" type="button" id="sticky-cart-bar" hidden>
<span class="sticky-cart-icon" aria-hidden="true"><i data-lucide="shopping-cart"></i></span>
<span class="sticky-cart-text">
<strong id="sticky-cart-name">${t('طلبك', 'Your order')}</strong>
<small><span id="sticky-cart-count">0</span> ${t('صنف', 'items')}</small>
</span>
<span class="sticky-cart-total" id="sticky-cart-total">0 ${escapeHtml(settings.currency || '₪')}</span>
</button>

<aside class="order-drawer" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="order-title" inert hidden>
<div class="drawer-backdrop js-close-cart"></div>
<section class="drawer-panel">
<div class="drawer-head">
<div><span class="mini-en">WHATSAPP ORDER</span><h2 id="order-title">${t('طلبك الحالي', 'Your current order')}</h2></div>
<button class="icon-btn js-close-cart" type="button" aria-label="${t('إغلاق', 'Close')}"><i data-lucide="x"></i></button>
</div>
<button class="clear-cart-btn hidden" id="clear-cart" type="button"><i data-lucide="trash-2"></i>${t('مسح الطلب', 'Clear order')}</button>
<div class="drawer-items" id="cart-items"></div>
<div class="drawer-empty" id="cart-empty">
<i data-lucide="shopping-bag"></i>
<p>${t('لم تضف أي طبق بعد.', 'No dishes added yet.')}</p>
${on(settings.show_featured)
    // مطلق لا نسبي: الصفحة تُخدم بشرطة مائلة أخيرة وبدونها معًا (كلاهما 200،
    // بلا تحويل). فعلى `/r/{slug}` بلا شرطة يُسقط المتصفح آخر مقطع وتصير
    // `menu/` هي `/r/menu/` — رابط لا وجود له. و`./` من `/menu` بلا شرطة
    // تعيد إلى الرئيسية بدل البقاء في القائمة.
    ? `<a href="${escapeHtml(menuUrlAttr)}" class="btn btn-outline js-close-cart">${escapeHtml(bi(settings, 'menu_cta', lang))}</a>`
    : `<button type="button" class="btn btn-outline js-close-cart">${t('إغلاق', 'Close')}</button>`}
</div>
<div class="drawer-upsell hidden" id="drawer-upsell">
<p class="drawer-upsell-title">${t('أكمل طلبك', 'Complete your order')}</p>
<div class="drawer-upsell-items" id="drawer-upsell-items"></div>
</div>
<div class="drawer-summary">
<div class="total-row"><span>${t('الإجمالي التقريبي', 'Estimated total')}</span><strong id="cart-total">0 ${escapeHtml(settings.currency || '₪')}</strong></div>
<fieldset class="fulfillment-options">
<legend>${t('طريقة استلام الطلب', 'Order method')}</legend>
<label><input type="radio" name="fulfillment" value="pickup" checked><span><i data-lucide="store"></i>${t('استلام من المطعم', 'Pickup')}</span></label>
<label><input type="radio" name="fulfillment" value="delivery"><span><i data-lucide="bike"></i>${t('ديليفري', 'Delivery')}</span></label>
</fieldset>
<div class="delivery-fields hidden" id="delivery-fields">
<label class="field-label" for="order-name">${t('اسم صاحب الطلب', 'Customer name')}</label>
<input id="order-name" type="text" autocomplete="name">
<label class="field-label" for="order-phone">${t('رقم الجوال', 'Phone number')}</label>
<input id="order-phone" type="tel" autocomplete="tel" inputmode="tel">
<label class="field-label" for="order-address">${t('عنوان التوصيل', 'Delivery address')}</label>
<textarea id="order-address" rows="2" autocomplete="street-address"></textarea>
</div>
<label class="field-label" for="order-notes">${t('ملاحظات الطلب', 'Order notes')}</label>
<textarea id="order-notes" rows="3"></textarea>
<button class="btn btn-whatsapp full-width" id="send-whatsapp" type="button"><i data-lucide="send"></i>${t('إرسال عبر واتساب', 'Send on WhatsApp')}</button>
</div>
</section>
</aside>

<div class="dish-dialog" id="dish-dialog" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="dish-dialog-title" inert hidden>
<div class="dish-dialog-backdrop js-close-dish"></div>
<section class="dish-dialog-panel">
<button class="icon-btn dish-dialog-close js-close-dish" type="button" aria-label="${t('إغلاق', 'Close')}"><i data-lucide="x"></i></button>
<div class="dish-dialog-image"><img id="dish-dialog-img" src="" alt=""></div>
<div class="dish-dialog-body">
<span class="mini-en">${t('تفاصيل الطبق', 'DISH DETAILS')}</span>
<h2 id="dish-dialog-title"></h2>
<p id="dish-dialog-desc"></p>
<div class="dish-dialog-options hidden" id="dish-dialog-variants">
<p class="dish-dialog-options-title">${t('اختر الحجم', 'Choose a size')}</p>
<div class="dish-dialog-option-list" id="dish-dialog-variant-list"></div>
</div>
<div class="dish-dialog-options hidden" id="dish-dialog-addons">
<p class="dish-dialog-options-title">${t('أضف إضافات', 'Add extras')}</p>
<div class="dish-dialog-option-list" id="dish-dialog-addon-list"></div>
</div>
<div class="dish-dialog-bottom">
<strong id="dish-dialog-price"></strong>
<button class="btn btn-whatsapp js-add-item" id="dish-dialog-add" type="button">
<i data-lucide="shopping-cart"></i><span class="add-label">${t('أضف للطلب', 'Add to order')}</span>
</button>
</div>
</div>
</section>
</div>
<script>(function(){
var params=new URLSearchParams(location.search);
var kind=params.get('flash');
if(!kind)return;
var box=document.getElementById('flash-message');
var text={
ok_reservation:${JSON.stringify(t('تم إرسال طلب الحجز. سنتواصل معك قريبًا.', 'Your reservation request was sent. We will contact you soon.'))},
err_reservation:${JSON.stringify(t('تعذّر إرسال طلب الحجز. راجع البيانات وحاول مجددًا.', 'Could not send the reservation. Please check the details and try again.'))},
rl_reservation:${JSON.stringify(t('محاولات كثيرة. حاول بعد قليل.', 'Too many attempts. Please try again shortly.'))}
}[kind];
if(!text)return;
box.hidden=false;
box.innerHTML='<div class="message '+(kind.indexOf('ok_')===0?'success':'error')+'">'+text+'</div>';
})();</script>
</body>
</html>`;
}


/* ==================== الصفحة الرئيسية (home.html) ==================== */

export function renderHome(site, { lang, base, canonical = '', homeUrl = '', slug = '' }) {
  const baseUrl = withSlash(base);
  const s = site.settings;
  const currency = s.currency || '₪';
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const featured = site.items;
  const bestSellers = site.bestSellers || [];

  const hero = `<section class="hero" id="hero">
<div class="hero-media" aria-hidden="true">
${s.hero_image_url ? `<picture><img src="${escapeHtml(s.hero_image_url)}" alt="" width="1672" height="941" fetchpriority="high"></picture>` : ''}
</div>
<div class="hero-shade"></div>
<div class="hero-embers" aria-hidden="true"></div>
<div class="page-shell hero-content">
<div class="hero-copy reveal">
<h1>${escapeHtml(bi(s, 'hero_title', lang))}</h1>
<div class="hero-title-en">${escapeHtml(lang === 'ar' ? String(s.hero_title_en || '').toUpperCase() : (s.hero_title_ar || ''))}</div>
<p class="hero-ar">${escapeHtml(bi(s, 'hero_text', lang))}</p>
<div class="hero-actions">
<button class="btn btn-red js-open-cart" type="button">
<i data-lucide="message-circle"></i><span><b>${escapeHtml(bi(s, 'order_cta', lang))}</b></span>
</button>
${on(s.show_featured) ? `<a class="btn btn-dark" href="menu/">
<span><b>${escapeHtml(bi(s, 'menu_cta', lang))}</b></span><i data-lucide="notebook-tabs"></i>
</a>` : ''}
</div>
</div>
</div>
<div class="page-shell hero-features">
${site.heroStats.map((stat) => `<article class="hero-feature reveal">
<i data-lucide="${heroStatLucide(stat.icon)}"></i>
<span><b>${escapeHtml(bi(stat, 'title', lang))}</b><small>${escapeHtml(miniLabel(stat, 'title', lang))}</small></span>
</article>`).join('')}
</div>
</section>`;

  const parts = [hero];

  if (on(s.show_featured)) {
    const categoryButtons = on(s.show_categories) ? `<div class="section-title category-section-title"><span class="red-streak"></span><div><h2>${escapeHtml(bi(s, 'menu_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'menu_title', lang))}</p></div></div>
<div class="home-menu-search-row">
<label class="menu-search" for="menu-search"><i data-lucide="search"></i>
<input id="menu-search" type="search" placeholder="${t('ابحث عن وجبة...', 'Search for a dish...')}" autocomplete="off"></label>
</div>
<div class="category-grid" id="category-filter-bar" role="group" aria-label="${t('تصنيفات القائمة', 'Menu categories')}">
<button class="category-card mobile-all-category active" type="button" data-filter="all" data-filter-label="${t('القائمة الكاملة', 'Full menu')}" aria-pressed="true">
<span class="category-icon"><i data-lucide="utensils"></i></span><strong>${t('الكل', 'All')}</strong><small>${t('القائمة الكاملة', 'FULL MENU')}</small>
</button>
${site.categories.map((category) => `<button class="category-card reveal" type="button" data-filter="${escapeHtml(category.slug)}" data-filter-label="${escapeHtml(bi(category, 'name', lang))}" aria-pressed="false">
<span class="category-icon"><i data-lucide="${categoryLucide(category.icon)}"></i></span>
<strong>${escapeHtml(bi(category, 'name', lang))}</strong><small>${escapeHtml(miniLabel(category, 'name', lang))}</small>
${category.image_url ? `<img src="${escapeHtml(category.image_url)}" alt="${escapeHtml(bi(category, 'name', lang))}" width="960" height="720" loading="lazy" decoding="async">` : ''}
<span class="category-vignette"></span>
</button>`).join('')}
</div>` : '';

    const dishGrid = featured.map((item) => menuCard(item, lang, currency)).join('')
      || `<p class="empty-state">${t('لا توجد أطباق متاحة حاليًا.', 'No dishes are currently available.')}</p>`;

    parts.push(`<section class="section menu-section" id="menu">
<div class="page-shell">
${categoryButtons}
<div class="section-title section-title-actions" id="featured">
<span class="red-streak"></span>
<div><h2>${escapeHtml(bi(s, 'featured_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'featured_title', lang))}</p></div>
<button type="button" class="view-all active" data-filter="all" data-filter-label="${t('القائمة الكاملة', 'Full menu')}" aria-pressed="true"><i data-lucide="utensils"></i><span><b>${t('عرض الكل', 'View all')}</b></span></button>
</div>
<div class="menu-results-bar" aria-live="polite">
<div><strong id="active-filter-label">${t('القائمة الكاملة', 'Full menu')}</strong><small><span id="visible-menu-count">${featured.length}</span> ${t('صنف متاح', 'available items')}</small></div>
<i data-lucide="utensils"></i>
</div>
<div class="menu-grid" id="menu-grid">
${dishGrid}
<p class="empty-state filter-empty hidden" id="filter-empty" role="status" aria-live="polite">${t('لا توجد أطباق متاحة في هذا التصنيف.', 'No dishes are available in this category.')}</p>
</div>
${bestSellersBlock(bestSellers, lang, currency, true)}
<div class="full-menu-cta">
<a class="btn btn-dark" href="menu/"><i data-lucide="notebook-tabs"></i><span><b>${t('عرض المنيو في صفحة مستقلة', 'Open the Full Menu')}</b></span></a>
<small>${t('صفحة سريعة ومناسبة للجوال والـ QR', 'Fast, mobile-friendly and ready for QR codes')}</small>
</div>
</div>
</section>`);
  }

  if (on(s.show_offers)) {
    parts.push(`<section class="section compact-section" id="offers">
<div class="page-shell">
<div class="section-title"><span class="red-streak"></span><div><h2>${escapeHtml(bi(s, 'offers_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'offers_title', lang))}</p></div></div>
<div class="offers-grid">
${site.offers.length ? site.offers.map((offer) => offerCard(offer, lang, currency)).join('')
    : `<p class="empty-state">${t('لا توجد عروض متاحة حاليًا.', 'No offers are currently available.')}</p>`}
</div>
</div>
</section>`);
  }

  if (on(s.show_services)) {
    parts.push(`<section class="section compact-section services-section" id="services">
<div class="page-shell">
<div class="section-title"><span class="red-streak"></span><div><h2>${escapeHtml(bi(s, 'services_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'services_title', lang))}</p></div></div>
<div class="services-grid">
${site.services.length ? site.services.map((service) => `<article class="service-card reveal">
<span class="service-icon${service.icon === 'whatsapp' ? ' green' : ''}"><i data-lucide="${serviceLucide(service.icon)}"></i></span>
<h3>${escapeHtml(bi(service, 'title', lang))}</h3><h4>${escapeHtml(miniLabel(service, 'title', lang))}</h4>
<p>${escapeHtml(bi(service, 'description', lang))}</p>
</article>`).join('') : `<p class="empty-state">${t('لا توجد خدمات منشورة حاليًا.', 'No services are currently published.')}</p>`}
</div>
</div>
</section>`);
  }

  if (on(s.show_reservation)) {
    parts.push(`<section class="section compact-section reservation-section" id="contact">
<div class="page-shell">
<div class="section-title"><span class="red-streak"></span><div><h2>${escapeHtml(on(s.plan_reservations) ? bi(s, 'reservation_title', lang) : t('تواصل معنا', 'Contact us'))}</h2><p>${escapeHtml(miniLabel(s, 'reservation_title', lang))}</p></div></div>
<div class="reservation-box reveal">
${on(s.plan_reservations) ? reservationForm(s, lang, baseUrl) : ''}
<div class="contact-card">
<p class="reservation-intro">${escapeHtml(bi(s, 'reservation_text', lang))}</p>
<div class="contact-row"><i data-lucide="map-pin"></i><span><b>${t('العنوان', 'Address')}</b><small>${escapeHtml(bi(s, 'address', lang))}</small></span></div>
<div class="contact-row"><i data-lucide="clock-3"></i><span><b>${t('ساعات العمل', 'Opening hours')}</b><small>${escapeHtml(bi(s, 'hours', lang))}</small></span></div>
<div class="contact-row"><i data-lucide="phone"></i><span><b>${t('الهاتف', 'Phone')}</b><small><a href="tel:${escapeHtml(String(s.phone || '').replace(/\s/g, ''))}">${escapeHtml(s.phone || '')}</a></small></span></div>
${s.email ? `<div class="contact-row"><i data-lucide="mail"></i><span><b>${t('البريد الإلكتروني', 'Email')}</b><small><a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a></small></span></div>` : ''}
</div>
<div class="whatsapp-panel">
<span class="wa-halo"><i data-lucide="message-circle"></i></span>
<h3>${escapeHtml(bi(s, 'order_cta', lang))}</h3>
<p>${escapeHtml(bi(s, 'whatsapp_panel_text', lang))}</p>
<button class="btn btn-whatsapp js-open-cart" type="button"><span>${escapeHtml(bi(s, 'order_cta', lang))}</span><i data-lucide="message-circle"></i></button>
</div>
</div>
</div>
</section>`);
  }

  if (on(s.show_about)) {
    parts.push(`<section class="section compact-section about-section" id="about">
<div class="page-shell">
<div class="section-title"><span class="red-streak"></span><div><h2>${escapeHtml(bi(s, 'about_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'about_title', lang))}</p></div></div>
<p class="about-text reveal">${escapeHtml(bi(s, 'about_text', lang))}</p>
</div>
</section>`);
  }

  if (on(s.show_reviews)) {
    const multi = site.testimonials.length > 1;
    parts.push(`<section class="section compact-section reviews-section" id="reviews">
<div class="page-shell">
<div class="section-title"><span class="red-streak"></span><div><h2>${escapeHtml(bi(s, 'reviews_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'reviews_title', lang))}</p></div></div>
<div class="reviews-wrap">
${multi ? `<button class="review-arrow prev" type="button" aria-label="${t('التقييم السابق', 'Previous review')}"><i data-lucide="chevron-right"></i></button>` : ''}
<div class="reviews-track" tabindex="0" aria-label="${t('تقييمات العملاء، يمكن تمريرها أفقيًا', 'Customer reviews, horizontally scrollable')}">
${site.testimonials.length ? site.testimonials.map((review) => `<article class="review-card reveal">
<i class="quote" data-lucide="quote"></i>
<p>${escapeHtml(bi(review, 'review', lang))}</p>
<div class="stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= Number(review.rating) ? 'on' : ''}">★</span>`).join('')}</div>
<footer>${review.avatar_url ? `<img src="${escapeHtml(review.avatar_url)}" alt="${escapeHtml(review.customer_name)}" width="43" height="43" loading="lazy" decoding="async">`
    : `<span class="avatar">${escapeHtml(review.customer_name.slice(0, 1))}</span>`}
<strong>${escapeHtml(review.customer_name)}</strong></footer>
</article>`).join('') : `<p class="empty-state">${t('لا توجد تقييمات منشورة حاليًا.', 'No reviews are currently published.')}</p>`}
</div>
${multi ? `<button class="review-arrow next" type="button" aria-label="${t('التقييم التالي', 'Next review')}"><i data-lucide="chevron-left"></i></button>` : ''}
</div>
</div>
</section>`);
  }

  if (on(s.show_faq)) {
    parts.push(`<section class="section compact-section faq-section" id="faq">
<div class="page-shell">
<div class="section-title"><span class="red-streak"></span><div><h2>${escapeHtml(bi(s, 'faq_title', lang))}</h2><p>${escapeHtml(miniLabel(s, 'faq_title', lang))}</p></div></div>
<div class="faq-grid">
${site.faqs.length ? site.faqs.map((faq) => `<article class="faq-item reveal">
<button type="button" aria-expanded="false" aria-controls="faq-answer-${escapeHtml(faq.id)}"><span>${escapeHtml(bi(faq, 'question', lang))}</span><i data-lucide="plus"></i></button>
<div class="faq-answer" id="faq-answer-${escapeHtml(faq.id)}" aria-hidden="true"><p>${escapeHtml(bi(faq, 'answer', lang))}</p></div>
</article>`).join('') : `<p class="empty-state">${t('لا توجد أسئلة منشورة حاليًا.', 'No questions are currently published.')}</p>`}
</div>
</div>
</section>`);
  }

  if (on(s.show_social) && site.socialPosts.length) {
    parts.push(`<section class="social-section">
<div class="page-shell">
<a class="social-title" href="${escapeHtml(s.instagram_url || 'https://www.instagram.com/')}" target="_blank" rel="noopener noreferrer" aria-label="${t('تابعنا على إنستغرام', 'Follow us on Instagram')}">
${instagramIcon()}<b>${escapeHtml(bi(s, 'social_title', lang))}</b>
</a>
<div class="social-grid">
${site.socialPosts.slice(0, 6).map((post) => {
    const url = post.post_url || s.instagram_url;
    const inner = `${post.image_url ? `<img src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}" width="960" height="720" loading="lazy" decoding="async">` : ''}<span>${instagramIcon()}</span>`;
    return url
      ? `<a class="social-card reveal" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(post.title || bi(s, 'social_title', lang))}">${inner}</a>`
      : `<div class="social-card reveal" role="img" aria-label="${escapeHtml(post.title || bi(s, 'social_title', lang))}">${inner}</div>`;
  }).join('')}
</div>
</div>
</section>`);
  }

  parts.push(footer(s, lang, true, baseUrl, slug));

  return layout({
    settings: s, lang, isMenuPage: false, bestSellers, offers: site.offers, canonical, homeUrl, base,
    title: bi(s, 'seo_title', lang) || bi(s, 'name', lang),
    description: bi(s, 'seo_description', lang) || bi(s, 'hero_text', lang),
    body: parts.join(''),
  });
}

const instagramIcon = () => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
  + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>'
  + '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>'
  + '<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>';

const facebookIcon = () => '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">'
  + '<path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.5-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z"/></svg>';

function reservationForm(s, lang, baseUrl) {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  return `<form class="reservation-form" method="post" action="${escapeHtml(baseUrl)}reservation/">
<div class="form-grid">
<label><span>${t('الاسم الكامل', 'Full name')}</span><input type="text" name="full_name" id="id_full_name" required maxlength="150" autocomplete="name"></label>
<label><span>${t('رقم الجوال', 'Phone number')}</span><input type="text" name="phone" id="id_phone" required autocomplete="tel" inputmode="tel"></label>
<label><span>${t('التاريخ', 'Date')}</span><input type="date" name="date" id="id_date" required
 min="${new Date().toISOString().slice(0, 10)}"
 max="${new Date(Date.now() + Number(s.max_reservation_days_ahead || 30) * 864e5).toISOString().slice(0, 10)}"></label>
<label><span>${t('الوقت', 'Time')}</span><input type="time" name="time" id="id_time" required step="${Number(s.reservation_slot_minutes || 30) * 60}"></label>
<label><span>${t('عدد الأشخاص', 'Number of people')}</span><input type="number" name="guests" id="id_guests" required min="1" max="50" value="2"></label>
<label><span>${t('المناسبة (اختياري)', 'Occasion (optional)')}</span><input type="text" name="occasion" id="id_occasion" maxlength="80"></label>
<label class="full"><span>${t('ملاحظات', 'Notes')}</span><textarea name="notes" id="id_notes" rows="3" maxlength="500"></textarea></label>
</div>
<button class="book-btn" type="submit" data-submit-label="${t('جارٍ الإرسال...', 'Sending...')}"><b>${t('إرسال طلب الحجز', 'Send reservation request')}</b></button>
</form>`;
}

/**
 * زر «الإدارة» في شريط التذييل السفلي.
 *
 * يمرّر الـslug لا معرّف المطعم الداخلي، وفي **جزء العنوان** (`#`) لا في
 * معاملات الاستعلام. سببان:
 *  - الـslug منشور أصلًا في عنوان كل صفحة، فتمريره لا يكشف جديدًا. (والمعرّف
 *    الداخلي منشور هو الآخر بلا قصد: `sid()` تحشره في معرّف كل صنف. هذا
 *    تسريب قائم يستحق إصلاحًا مستقلًّا، لا مبرّرًا لزيادته.)
 *  - ما بعد `#` لا يُرسل إلى أي خادم ولا يدخل سجلات الوسطاء، بخلاف `?r=`.
 *
 * ولا يُمرَّر اسم مستخدم ولا كلمة مرور بحال: الزر يختصر خانة واحدة فقط،
 * ويبقى الدخول كاملًا كما هو.
 */
function adminLink(baseUrl, lang, slug) {
  // على نطاق المطعم الجذر موقعُ الزبون واللوحة على `/admin/`؛ وعلى المسار
  // القديم (`/r/{slug}/`) اللوحة في جذر المحرك. الفارق يُقرأ من `base` نفسه.
  const panel = baseUrl === '/' ? '/admin/' : '/';
  const label = lang === 'ar' ? 'الإدارة' : 'Management';
  return `<a class="footer-admin" href="${panel}#r=${encodeURIComponent(slug || '')}" rel="nofollow noopener">`
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
    + `<span>${escapeHtml(label)}</span></a>`;
}

function footer(s, lang, showCategories, baseUrl, slug) {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const compact = !on(s.show_featured) || !on(s.show_categories);
  return `<footer class="site-footer">
<div class="page-shell footer-grid${compact ? ' footer-grid-compact' : ''}">
<div class="footer-brand">
${s.logo_url ? `<img src="${escapeHtml(s.logo_url)}" alt="${escapeHtml(bi(s, 'name', lang))}" width="890" height="810" loading="lazy" decoding="async">`
    : `<span class="brand-wordmark">${escapeHtml(bi(s, 'name', lang))}</span>`}
<p>${escapeHtml(bi(s, 'footer_text', lang))}</p>
<div class="footer-socials">
${s.facebook_url ? `<a class="social-facebook" href="${escapeHtml(s.facebook_url)}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">${facebookIcon()}</a>` : ''}
${s.instagram_url ? `<a class="social-instagram" href="${escapeHtml(s.instagram_url)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">${instagramIcon()}</a>` : ''}
<button class="social-whatsapp js-open-cart" type="button" aria-label="WhatsApp"><i data-lucide="message-circle"></i></button>
</div>
</div>
<div><h3>${t('روابط سريعة', 'Quick links')}</h3><a href="${escapeHtml(baseUrl)}#hero">${t('الرئيسية', 'Home')}</a>
${on(s.show_about) ? `<a href="${escapeHtml(baseUrl)}#about">${t('من نحن', 'About us')}</a>` : ''}
${on(s.show_featured) ? `<a href="${escapeHtml(baseUrl)}menu/">${t('المنيو الكامل', 'Full menu')}</a>` : ''}
${on(s.show_offers) ? `<a href="${escapeHtml(baseUrl)}#offers">${t('العروض', 'Offers')}</a>` : ''}
${on(s.show_reservation) ? `<a href="${escapeHtml(baseUrl)}#contact">${t('تواصل معنا', 'Contact us')}</a>` : ''}
</div>
${showCategories && on(s.show_featured) && on(s.show_categories) ? '' : ''}
<div><h3>${t('تواصل معنا', 'Contact us')}</h3><a href="tel:${escapeHtml(String(s.phone || '').replace(/\s/g, ''))}">${escapeHtml(s.phone || '')}</a>
${s.email ? `<a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a>` : ''}<span>${escapeHtml(bi(s, 'address', lang))}</span></div>
</div>
<div class="page-shell footer-bottom"><span>© ${new Date().getFullYear()} ${escapeHtml(s.name_en || s.name_ar)}. ${t('جميع الحقوق محفوظة.', 'All rights reserved.')}</span>
${adminLink(baseUrl, lang, slug)}</div>
</footer>`;
}

/* ==================== بطاقات مشتركة ==================== */

function dishAddButtonAttrs(item, lang) {
  const variants = JSON.stringify((item.variants || []).map((v) => ({
    id: v.id, nameAr: v.name_ar, nameEn: v.name_en, price: priceText(v.price_minor),
  })));
  const addons = JSON.stringify((item.addons || []).map((a) => ({
    id: a.id, nameAr: a.name_ar, nameEn: a.name_en, price: priceText(a.price_minor),
  })));
  const hasVariants = (item.variants || []).length > 0;
  const desc = bi(item, 'description', lang);
  const ariaLabel = hasVariants
    ? (lang === 'ar' ? `اختر حجم ${item.name_ar}` : `Choose a size for ${item.name_en}`)
    : (lang === 'ar' ? `أضف ${item.name_ar} إلى السلة` : `Add ${item.name_en} to cart`);
  return `class="mini-whatsapp ${hasVariants ? 'js-open-dish' : 'js-add-item'}${on(item.is_featured) ? ' featured-order-btn' : ''}" type="button" `
    + `data-id="${escapeHtml(item.id)}" data-name-ar="${escapeHtml(item.name_ar)}" data-name-en="${escapeHtml(item.name_en)}" `
    + `data-price="${priceText(startingPrice(item))}" data-desc-ar="${escapeHtml(item.description_ar || '')}" `
    + `data-desc-en="${escapeHtml(item.description_en || item.description_ar || '')}" `
    + `data-variants='${variants.replace(/'/g, '&#39;')}' data-addons='${addons.replace(/'/g, '&#39;')}' `
    + `aria-label="${escapeHtml(ariaLabel)}"`;
  void desc;
}

const startingPrice = (item) => {
  if (!Number(item.is_priced)) return 0;
  const variants = item.variants || [];
  if (variants.length) return Math.min(...variants.map((v) => Number(v.price_minor)));
  return Number(item.price_minor);
};

function customizationLabel(item, lang) {
  const hasVariants = (item.variants || []).length > 0;
  const hasAddons = (item.addons || []).length > 0;
  if (hasVariants && hasAddons) return lang === 'ar' ? 'أحجام وإضافات' : 'Sizes & extras';
  if (hasVariants) return lang === 'ar' ? 'أحجام متعددة' : 'Multiple sizes';
  if (hasAddons) return lang === 'ar' ? 'إضافات متاحة' : 'Extras available';
  return '';
}

function menuCard(item, lang, currency) {
  const hasVariants = (item.variants || []).length > 0;
  const badge = bi(item, 'badge', lang);
  const label = customizationLabel(item, lang);
  const from = startingPrice(item);
  return `<article class="menu-card reveal" data-category="${escapeHtml(item.category_slug || '')}" data-icon="${escapeHtml(item.category_icon || '')}" data-search="${escapeHtml(`${item.name_ar} ${item.name_en} ${item.description_ar || ''} ${item.description_en || ''}`)}">
<div class="menu-image js-open-dish" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(lang === 'ar' ? `تفاصيل ${item.name_ar}` : `${item.name_en} details`)}">
${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(bi(item, 'name', lang))}" width="960" height="720" loading="lazy" decoding="async" fetchpriority="low">` : ''}
${badge ? `<span class="dish-badge">${escapeHtml(badge)}</span>` : ''}
<span class="image-sheen"></span>
</div>
<div class="menu-content">
<h3>${escapeHtml(bi(item, 'name', lang))}</h3>
<h4>${escapeHtml(miniLabel(item, 'name', lang))}</h4>
${label ? `<span class="customizable-tag"><i data-lucide="sliders-horizontal"></i>${escapeHtml(label)}</span>` : ''}
<p>${escapeHtml(truncate(bi(item, 'description', lang), 105))}</p>
<div class="menu-bottom">
<div class="price-wrap">
${hasVariants ? `<small class="from-label">${lang === 'ar' ? 'من' : 'from'}</small>`
    : (Number(item.old_price_minor) > from ? `<del>${priceText(item.old_price_minor)}</del>` : '')}
<strong>${Number(item.is_priced)
    ? `${priceText(from)} <small>${escapeHtml(currency)}</small>`
    : (lang === 'ar' ? 'حسب الطلب' : 'On request')}</strong>
</div>
${Number(item.is_priced) ? `<button ${dishAddButtonAttrs(item, lang)}>
<i data-lucide="shopping-cart"></i><span class="cart-plus" aria-hidden="true">+</span>
${on(item.is_featured) ? `<span class="add-label">${lang === 'ar' ? 'اطلب الطبق' : 'Order dish'}</span>` : ''}
</button>` : ''}
</div>
</div>
</article>`;
}

function offerCard(offer, lang, currency) {
  const priceTextAr = offer.price_text_ar || (Number(offer.is_priced) ? priceText(offer.price_minor) : '');
  const priceTextEn = offer.price_text_en || priceTextAr;
  const oldText = bi(offer, 'old_price_text', lang);
  return `<article class="offer-card reveal">
${offer.image_url ? `<img src="${escapeHtml(offer.image_url)}" alt="${escapeHtml(bi(offer, 'title', lang))}" width="960" height="720" loading="lazy" decoding="async">` : ''}
<div class="offer-overlay"></div>
<div class="offer-copy">
<h3>${escapeHtml(bi(offer, 'title', lang))}</h3><h4>${escapeHtml(miniLabel(offer, 'title', lang))}</h4>
<p>${escapeHtml(bi(offer, 'description', lang))}</p>
<div class="offer-bottom">
<div class="offer-price-wrap">
${oldText ? `<del class="offer-old-price">${escapeHtml(oldText)}</del>` : ''}
<strong>${escapeHtml(lang === 'ar' ? priceTextAr : priceTextEn)}</strong>
</div>
<button class="offer-order-btn js-add-item" type="button" data-id="offer-${escapeHtml(offer.id)}"
 data-name-ar="${escapeHtml(offer.title_ar)}" data-name-en="${escapeHtml(offer.title_en)}"
 data-price-text-ar="${escapeHtml(priceTextAr)}" data-price-text-en="${escapeHtml(priceTextEn)}" data-offer="true"
 aria-label="${escapeHtml(lang === 'ar' ? `أضف عرض ${offer.title_ar} إلى السلة` : `Add ${offer.title_en} offer to cart`)}">
<i data-lucide="shopping-cart"></i><span>${lang === 'ar' ? 'اطلب العرض' : 'Order offer'}</span>
</button>
</div>
</div>
</article>`;
}

/**
 * قسم الأكثر طلبًا — يُحسب من طلبات فعلية لا من رقم يختاره أحد يدويًا.
 * الأول بطاقة مكبَّرة، والباقي شبكة عادية، مطابقةً لأضنة.
 */
function bestSellersBlock(bestSellers, lang, currency, wide) {
  if (!bestSellers.length) return '';
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const [top, ...rest] = bestSellers;
  return `<div class="best-sellers-subsection" id="best-sellers">
<div class="section-title best-sellers-subsection-title">
<span class="red-streak"></span>
<div><h2>${t('الوجبات الأكثر طلبًا', 'Most Ordered Meals')}</h2><p>${t('اختيارات زبائننا الحقيقية', 'REAL CUSTOMER FAVOURITES')}</p></div>
</div>
<p class="best-sellers-intro">${t('يُحدّث هذا الترتيب تلقائيًا من الطلبات المسجلة أونلاين ومن داخل المطعم.', 'This ranking updates automatically from recorded online and dine-in orders.')}</p>
<article class="best-seller-featured reveal">
<div class="best-seller-featured-media">${top.image_url ? `<img src="${escapeHtml(top.image_url)}" alt="${escapeHtml(bi(top, 'name', lang))}" width="960" height="720" loading="lazy" decoding="async">` : ''}</div>
<div class="best-seller-featured-content">
<span class="best-seller-featured-badge"><i data-lucide="flame"></i>${t('الأكثر طلبًا #1', '#1 Best Seller')}</span>
<h3>${escapeHtml(bi(top, 'name', lang))}</h3>
${bi(top, 'description', lang) ? `<p>${escapeHtml(truncate(bi(top, 'description', lang), 130))}</p>` : ''}
<div class="order-proof">
<strong><i data-lucide="flame"></i>${top.order_count} ${t('طلب', 'orders')}</strong>
<small>${top.online_order_count} ${t('أونلاين', 'online')} · ${top.cashier_order_count} ${t('داخل المطعم', 'dine-in')}</small>
</div>
<div class="menu-bottom">
<div class="price-wrap"><strong>${priceText(top.price_minor)} <small>${escapeHtml(currency)}</small></strong></div>
<button class="mini-whatsapp js-add-item featured-order-btn" type="button" data-id="${escapeHtml(top.id)}"
 data-name-ar="${escapeHtml(top.name_ar)}" data-name-en="${escapeHtml(top.name_en)}" data-price="${priceText(top.price_minor)}"
 aria-label="${escapeHtml(lang === 'ar' ? `أضف ${top.name_ar} إلى السلة` : `Add ${top.name_en} to cart`)}">
<i data-lucide="shopping-cart"></i><span class="cart-plus" aria-hidden="true">+</span><span class="add-label">${t('اطلب الطبق', 'Order dish')}</span>
</button>
</div>
</div>
</article>
${rest.length ? `<div class="menu-grid best-sellers-grid best-sellers-grid-rest">
${rest.map((item, index) => `<article class="menu-card best-seller-card reveal">
<div class="menu-image js-open-dish" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(lang === 'ar' ? `تفاصيل ${item.name_ar}` : `${item.name_en} details`)}">
${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(bi(item, 'name', lang))}" width="960" height="720" loading="lazy" decoding="async">` : ''}
<span class="best-seller-rank">#${index + 2}</span><span class="image-sheen"></span>
</div>
<div class="menu-content">
<h3>${escapeHtml(bi(item, 'name', lang))}</h3><h4>${escapeHtml(miniLabel(item, 'name', lang))}</h4>
<div class="order-proof">
<strong><i data-lucide="flame"></i>${item.order_count} ${t('طلب', 'orders')}</strong>
<small>${item.online_order_count} ${t('أونلاين', 'online')} · ${item.cashier_order_count} ${t('داخل المطعم', 'dine-in')}</small>
</div>
<div class="menu-bottom">
<div class="price-wrap"><strong>${priceText(item.price_minor)} <small>${escapeHtml(currency)}</small></strong></div>
<button class="mini-whatsapp js-add-item" type="button" data-id="${escapeHtml(item.id)}"
 data-name-ar="${escapeHtml(item.name_ar)}" data-name-en="${escapeHtml(item.name_en)}" data-price="${priceText(item.price_minor)}"
 aria-label="${escapeHtml(lang === 'ar' ? `أضف ${item.name_ar} إلى السلة` : `Add ${item.name_en} to cart`)}">
<i data-lucide="shopping-cart"></i><span class="cart-plus" aria-hidden="true">+</span>
</button>
</div>
</div>
</article>`).join('')}
</div>` : ''}
</div>`;
  void wide;
}

/* ==================== صفحة المنيو (menu.html) ==================== */

export function renderMenu(site, { lang, base, canonical = '', activeCategory = 'all', slug = '' }) {
  const s = site.settings;
  const currency = s.currency || '₪';
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const bestSellers = site.bestSellers || [];
  const activeCategoryRow = site.categories.find((c) => c.slug === activeCategory);
  const activeLabel = activeCategory === 'all' ? t('المنيو الكامل', 'Full menu') : bi(activeCategoryRow || {}, 'name', lang);

  const body = `<section class="menu-page-hero" id="menu-top">
<div class="page-shell menu-page-hero-inner">
<div class="menu-page-kicker"><i data-lucide="utensils"></i><span>${t('منيو المطعم', 'RESTAURANT MENU')}</span></div>
<h1>${t('اختر وجبتك بسهولة', 'Choose Your Meal Easily')}</h1>
<p>${t('كل الأصناف والأسعار المحدثة في مكان واحد، مع طلب مباشر من جوالك.', 'Every available dish and current price in one place, ready to order from your phone.')}</p>
<div class="menu-page-trust">
<span><i data-lucide="badge-check"></i>${t('أسعار محدثة', 'Current prices')}</span>
<span><i data-lucide="smartphone"></i>${t('مصمم للجوال والـ QR', 'Built for mobile & QR')}</span>
<span><i data-lucide="shopping-cart"></i>${t('طلب مباشر', 'Direct ordering')}</span>
</div>
</div>
</section>

<section class="menu-page-catalog" id="menu-catalog">
<div class="page-shell">
<div class="menu-page-heading menu-catalog-heading">
<div><span>${t('استكشف الأصناف', 'EXPLORE THE MENU')}</span><h2>${t('المنيو الكامل', 'Full Menu')}</h2></div>
<label class="menu-search" for="menu-search"><i data-lucide="search"></i>
<input id="menu-search" type="search" placeholder="${t('ابحث عن وجبة...', 'Search for a dish...')}" autocomplete="off"></label>
</div>
<div class="category-grid menu-page-categories" id="category-filter-bar" role="group" aria-label="${t('تصنيفات القائمة', 'Menu categories')}">
<button class="category-card mobile-all-category${activeCategory === 'all' ? ' active' : ''}" type="button" data-filter="all" data-filter-label="${t('المنيو الكامل', 'Full menu')}" aria-pressed="${activeCategory === 'all'}">
<span class="category-icon"><i data-lucide="utensils"></i></span><strong>${t('الكل', 'All')}</strong><small>${t('المنيو الكامل', 'FULL MENU')}</small>
</button>
${site.categories.map((category) => `<button class="category-card${activeCategory === category.slug ? ' active' : ''}" type="button" data-filter="${escapeHtml(category.slug)}" data-filter-label="${escapeHtml(bi(category, 'name', lang))}" aria-pressed="${activeCategory === category.slug}">
<span class="category-icon"><i data-lucide="${categoryLucide(category.icon)}"></i></span>
<strong>${escapeHtml(bi(category, 'name', lang))}</strong><small>${escapeHtml(miniLabel(category, 'name', lang))}</small>
${category.image_url ? `<img src="${escapeHtml(category.image_url)}" alt="" width="960" height="720" loading="lazy" decoding="async">` : ''}
<span class="category-vignette"></span>
</button>`).join('')}
</div>
<div class="menu-results-bar menu-page-results" aria-live="polite">
<div><strong id="active-filter-label">${escapeHtml(activeLabel)}</strong>
<small><span id="visible-menu-count">${site.items.length}</span> ${t('من', 'of')} <span id="total-menu-count">${site.items.length}</span> ${t('صنف', 'items')}</small></div>
<button class="menu-show-all-btn${activeCategory === 'all' ? ' active' : ''}" type="button" data-filter="all" data-clear-search="true" data-filter-label="${t('المنيو الكامل', 'Full menu')}" aria-pressed="${activeCategory === 'all'}">
<i data-lucide="layout-grid"></i><span>${t('عرض الكل', 'Show all')}</span>
</button>
</div>
<div class="menu-grid menu-page-grid" id="menu-grid" data-page-size="6">
${site.items.length ? site.items.map((item) => menuCard(item, lang, currency)).join('')
    : `<p class="empty-state">${t('لا توجد أطباق متاحة حاليًا.', 'No dishes are currently available.')}</p>`}
<p class="empty-state filter-empty hidden" id="filter-empty" role="status" aria-live="polite">${t('لا توجد وجبات تطابق اختيارك أو بحثك.', 'No dishes match your selection or search.')}</p>
</div>
<div class="menu-load-more-wrap">
<button class="menu-load-more-btn hidden" id="menu-load-more" type="button">
<i data-lucide="chevrons-down"></i><span>${t('عرض 6 أصناف إضافية', 'Show 6 more dishes')}</span>
<small><span id="remaining-menu-count">0</span> ${t('متبقٍ', 'remaining')}</small>
</button>
</div>
</div>
</section>

${bestSellers.length ? `<section class="menu-page-best" id="menu-best">
<div class="page-shell">
<div class="menu-page-heading"><div><span>${t('اختيارات زبائننا', 'CUSTOMER FAVOURITES')}</span><h2>${t('الأكثر طلبًا', 'Most Ordered')}</h2></div>
<small>${t('مرتب تلقائيًا من الطلبات الحقيقية', 'Ranked automatically from real orders')}</small></div>
<div class="menu-spotlight-grid">
${bestSellers.map((item, index) => `<article class="menu-spotlight-card reveal">
<div class="menu-spotlight-image">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(bi(item, 'name', lang))}" width="960" height="720" loading="lazy" decoding="async">` : ''}<span>#${index + 1}</span></div>
<div class="menu-spotlight-copy">
<h3>${escapeHtml(bi(item, 'name', lang))}</h3>
<small><i data-lucide="flame"></i>${item.order_count} ${t('طلب', 'orders')}</small>
<div><strong>${priceText(item.price_minor)} <em>${escapeHtml(currency)}</em></strong>
<button class="mini-whatsapp js-add-item" type="button" data-id="${escapeHtml(item.id)}" data-name-ar="${escapeHtml(item.name_ar)}" data-name-en="${escapeHtml(item.name_en)}" data-price="${priceText(item.price_minor)}"
 aria-label="${escapeHtml(lang === 'ar' ? `أضف ${item.name_ar} إلى السلة` : `Add ${item.name_en} to cart`)}">
<i data-lucide="shopping-cart"></i><span class="cart-plus" aria-hidden="true">+</span>
</button></div>
</div>
</article>`).join('')}
</div>
</div>
</section>` : ''}

${site.offers.length ? `<section class="menu-page-offers" id="menu-offers">
<div class="page-shell">
<div class="menu-page-heading"><div><span>${t('وفر أكثر مع عروضنا', 'SPECIAL SAVINGS')}</span><h2>${t('العروض المتاحة', 'Available Offers')}</h2></div>
<small>${t('أضف العرض مباشرة إلى طلبك', 'Add an offer directly to your order')}</small></div>
<div class="offers-grid menu-page-offers-grid">
${site.offers.map((offer) => offerCard(offer, lang, currency)).join('')}
</div>
</div>
</section>` : ''}

<footer class="menu-page-footer">
<div class="page-shell">
<span>${escapeHtml(s.name_ar)} · ${escapeHtml(s.name_en)}</span>
<a href="./">${t('العودة إلى الموقع الرئيسي', 'Back to the main website')}</a>
</div>
</footer>`;

  return layout({
    settings: s, lang, isMenuPage: true, bestSellers, offers: site.offers, canonical, base,
    title: bi(s, 'name', lang) ? (lang === 'ar' ? `منيو ${s.name_ar}` : `${s.name_en} Menu`) : (lang === 'ar' ? 'المنيو' : 'Menu'),
    description: bi(s, 'seo_description', lang) || bi(s, 'hero_text', lang),
    body,
  });
}

/* ==================== صفحة الطلب (order_detail.html) ==================== */

const STATUS_LABEL_AR = { new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', delivered: 'تم التسليم', cancelled: 'ملغي' };
const FULFILLMENT_LABEL_AR = { pickup: 'استلام من المطعم', delivery: 'ديليفري', dine_in: 'داخل المطعم' };

/**
 * صفحة قائمة بذاتها — لا رأس ولا تذييل، فتفتح سريعًا من كاميرا هاتف. مع ذلك
 * تبقى صفحة المطعم: كل لون وخط من إعداداته، المصدر نفسه الذي يقرأ منه
 * الهيكل العام. عربية فقط كأضنة (الصفحة لا تُترجَم في الأصل).
 */
export function renderOrder(site, order, lines, { base, receiptUrl }) {
  const s = site.settings;
  const currency = order.currency || '₪';
  const fonts = fontStacks(s);
  const created = new Date(Number(order.created_at));
  const dateText = created.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' })
    + ' — ' + created.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', hour12: false });

  const lineRows = lines.map((line) => {
    const total = Number(line.unit_price_minor) * Number(line.quantity);
    return `<div class="line">
<span>${escapeHtml(line.name_ar)} <em>× ${line.quantity}</em></span>
${Number(line.is_priced)
      ? `<span>${priceText(total)} ${escapeHtml(currency)}</span>`
      : `<span class="quote">${escapeHtml(line.price_note || 'يُحدد عند التأكيد')}</span>`}
</div>`;
  }).join('');

  const customerRows = [
    order.customer_name && ['الاسم', escapeHtml(order.customer_name)],
    order.source === 'cashier' && ['الزبائن', String(order.customer_count)],
    order.table_number && ['الطاولة', escapeHtml(order.table_number)],
    order.phone && ['الجوال', `<span dir="ltr">${escapeHtml(order.phone)}</span>`],
    order.address && ['العنوان', escapeHtml(order.address)],
    order.notes && ['ملاحظات', escapeHtml(order.notes)],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>الطلب ${escapeHtml(order.code)} — ${escapeHtml(s.name_ar)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${escapeHtml(fontUrl(s.arabic_font, s.display_font, s.latin_font, s.arabic_display_font))}">
<style>
:root{
--bg:${safeColor(s.background_color, '#050505')}; --card:${safeColor(s.surface_color, '#111111')};
--line:rgba(${rgbTriplet(s.gold_color, '#D4AF37')},.2); --ink:#ffffff; --dim:#a8a8a8; --faint:#7a7a7a;
--gold:${safeColor(s.gold_color, '#D4AF37')}; --gold-rgb:${rgbTriplet(s.gold_color, '#D4AF37')};
--red:${safeColor(s.primary_color, '#E30613')}; --red-rgb:${rgbTriplet(s.primary_color, '#E30613')};
--red-ink:color-mix(in srgb, var(--red) 55%, white); --wa:${safeColor(s.whatsapp_color, '#25D366')};
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:${fonts.arabic};font-variant-numeric:tabular-nums;line-height:1.65;padding:22px 16px 48px}
.sheet{width:min(560px,100%);margin-inline:auto}
h1,h2{margin:0;line-height:1.25} a{color:inherit;text-decoration:none}
.head{text-align:center;padding-bottom:20px} .head b{display:block;font-size:1.2rem;font-weight:900} .head small{color:var(--gold);font-size:.8rem}
.code-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;text-align:center;margin-bottom:14px}
.code-card span{display:block;font-size:.74rem;color:var(--faint);letter-spacing:.1em}
.code-card b{display:block;font-size:2rem;font-weight:900;color:var(--gold);letter-spacing:.05em}
.pill{display:inline-block;margin-top:8px;padding:4px 13px;border-radius:999px;font-size:.76rem;font-weight:700;background:rgba(var(--red-rgb),.16);color:var(--red-ink)}
.pill.pickup{background:rgba(var(--gold-rgb),.16);color:var(--gold)} .pill.dine_in{background:rgba(37,211,102,.14);color:var(--wa)}
.status{margin-top:8px;font-size:.78rem;color:var(--dim)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:14px}
.card h2{font-size:.82rem;color:var(--faint);font-weight:600;margin-bottom:10px}
.line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #1c1c1c;font-size:.92rem} .line:last-child{border-bottom:0}
.line .quote{color:var(--gold);font-size:.8rem}
.total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:13px 15px;border-radius:12px;background:rgba(var(--gold-rgb),.09);border:1px solid rgba(var(--gold-rgb),.3)}
.total span{color:var(--gold);font-size:.9rem} .total b{color:var(--gold);font-size:1.4rem;font-weight:900}
.note{margin-top:8px;font-size:.76rem;color:var(--faint)}
dl{margin:0;display:grid;gap:8px} dl>div{display:flex;gap:10px;font-size:.88rem} dt{color:var(--faint);min-width:74px} dd{margin:0}
.receipt-actions{display:grid;gap:8px;margin-bottom:14px}
.receipt-link{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:12px;border:1px solid var(--line);font-size:.86rem;font-weight:700;color:var(--dim);background:transparent;font-family:inherit;cursor:pointer}
.receipt-link:hover{color:var(--ink);border-color:var(--gold)} .receipt-link.share{border-color:rgba(37,211,102,.45);color:var(--wa)}
.receipt-link.share:hover{border-color:var(--wa)} .receipt-link[hidden]{display:none}
.foot{text-align:center;font-size:.74rem;color:var(--faint);margin-top:20px;line-height:1.9}
</style>
</head>
<body>
<div class="sheet">
<div class="head"><b>${escapeHtml(order.restaurant_name || s.name_ar)}</b><small>${escapeHtml(order.restaurant_tagline || s.tagline_ar || '')}</small></div>
<div class="code-card">
<span>رقم الطلب</span><b>${escapeHtml(order.code)}</b>
<span class="pill ${escapeHtml(order.fulfillment)}">${escapeHtml(FULFILLMENT_LABEL_AR[order.fulfillment] || order.fulfillment)}</span>
<p class="status">${escapeHtml(dateText)} · ${escapeHtml(STATUS_LABEL_AR[order.status] || order.status)}</p>
</div>
${receiptUrl ? `<div class="receipt-actions">
<a class="receipt-link" href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener">عرض صورة الفاتورة</a>
<button class="receipt-link share" type="button" id="share-receipt" hidden data-receipt="${escapeHtml(receiptUrl)}" data-code="${escapeHtml(order.code)}">مشاركة صورة الفاتورة</button>
</div>` : ''}
<div class="card">
<h2>الأصناف</h2>
${lineRows}
<div class="total"><span>الإجمالي</span><b>${priceText(order.total_minor)} ${escapeHtml(currency)}</b></div>
${Number(order.has_unpriced_lines) ? '<p class="note">يضاف إليه سعر العروض التي تُحدد عند التأكيد.</p>' : ''}
</div>
${customerRows.length ? `<div class="card"><h2>بيانات العميل</h2><dl>
${customerRows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
</dl></div>` : ''}
<p class="foot">الأسعار في هذه الصفحة محسوبة على خادم المطعم ولا يمكن تعديلها من المتصفح.<br>هذه الصفحة هي المرجع المعتمد لهذا الطلب.</p>
</div>
<script>
(function(){
var button=document.getElementById('share-receipt');
if(!button||!navigator.canShare||typeof File!=='function')return;
var probe=new File([new Blob([''],{type:'image/png'})],'probe.png',{type:'image/png'});
try{if(!navigator.canShare({files:[probe]}))return;}catch(e){return;}
button.hidden=false;
button.addEventListener('click',function(){
var label=button.textContent; button.disabled=true; button.textContent='جارٍ التحضير…';
fetch(button.dataset.receipt,{credentials:'same-origin'}).then(function(r){return r.blob();})
.then(function(blob){
var file=new File([blob],button.dataset.code+'.png',{type:'image/png'});
return navigator.share({files:[file]});
}).catch(function(){}).then(function(){button.disabled=false;button.textContent=label;});
});
})();
</script>
</body>
</html>`;
}

/* ==================== صفحات الأعذار ==================== */

/**
 * صفحة بديلة حين لا يوجد إعدادات — مطعم موقوف أو رابط خاطئ. لا تكشف أيهما:
 * «موقوف لعدم الدفع» على صفحة عامة يقرؤها زبائن المطعم ومنافسوه.
 */
export function simplePage(title, message, status = 404) {
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f5f5f5;
font-family:system-ui,sans-serif;text-align:center;padding:2rem}h1{font-size:1.6rem;margin:0 0 .6rem}
p{color:#a3a3a3;max-width:44ch}</style></head>
<body><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
