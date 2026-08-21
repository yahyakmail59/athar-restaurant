/**
 * الموقع العام، مبنيّ على الخادم.
 *
 * لماذا SSR وليس تطبيقًا يجلب JSON: موقع المطعم يُفتح من نتيجة بحث ومن رابط
 * واتساب، وأول ما يصل يجب أن يكون الصفحة نفسها لا هيكلًا فارغًا ينتظر طلبًا
 * ثانيًا. هذا فرق جوهري عن الصيدلية والمدرسة — هناك الواجهة تطبيق يدخله
 * موظف، وهنا الصفحة هي المنتج المعروض على الزبون.
 *
 * الهوية كلها من `settings`: الألوان والخطوط وكل نص. لا شيء منها مكتوب هنا،
 * ولذلك يعطي هذا الملف الواحد مطعمين لا يشبه أحدهما الآخر.
 */

import { escapeHtml, money, safeColor, safeFont } from './lib.js';

/** نص بلغة الصفحة، وإن كان فارغًا فبالأخرى: حقل غير مترجَم أهون من فراغ. */
export const t = (row, field, lang) =>
  String(row?.[`${field}_${lang}`] || row?.[`${field}_${lang === 'ar' ? 'en' : 'ar'}`] || '');

const on = (value) => Number(value) === 1;

/**
 * الخطوط من Google Fonts وحدها.
 *
 * اسم الخط يأتي من قاعدة البيانات، وهو يدخل في رابط ثم في CSS. لذلك يمر
 * من `safeFont` قبل الاثنين: اسم فيه محارف خاصة يخرج من قيمة الخاصية.
 */
function fontLink(settings) {
  const families = [...new Set([
    safeFont(settings.arabic_font, 'Cairo'),
    safeFont(settings.arabic_display_font, 'Cairo'),
    safeFont(settings.display_font, 'Playfair Display'),
    safeFont(settings.latin_font, 'Inter'),
  ])];
  const query = families.map((name) => `family=${encodeURIComponent(name)}:wght@400;600;700`).join('&');
  return `<link rel="preconnect" href="https://fonts.googleapis.com">`
    + `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">`;
}

function themeVars(settings, lang) {
  const dark = String(settings.theme || 'dark') !== 'light';
  const body = lang === 'ar' ? safeFont(settings.arabic_font, 'Cairo') : safeFont(settings.latin_font, 'Inter');
  const display = lang === 'ar'
    ? safeFont(settings.arabic_display_font, 'Cairo')
    : safeFont(settings.display_font, 'Playfair Display');
  return `:root{
--brand:${safeColor(settings.primary_color, '#E30613')};
--gold:${safeColor(settings.gold_color, '#D4AF37')};
--bg:${safeColor(settings.background_color, dark ? '#050505' : '#FFFFFF')};
--surface:${safeColor(settings.surface_color, dark ? '#111111' : '#F5F5F5')};
--wa:${safeColor(settings.whatsapp_color, '#25D366')};
--ink:${dark ? '#F5F5F5' : '#141414'};
--muted:${dark ? '#A3A3A3' : '#5C5C5C'};
--line:${dark ? '#262626' : '#E4E4E4'};
--font:'${body}',system-ui,sans-serif;
--display:'${display}','${body}',serif;
}`;
}

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.7;
  -webkit-text-size-adjust:100%}
img{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
.wrap{width:min(1140px,100% - 2.5rem);margin-inline:auto}
section{padding:4.5rem 0}
h1,h2,h3{font-family:var(--display);line-height:1.25;margin:0 0 .6rem}
h2{font-size:clamp(1.7rem,4vw,2.6rem)}
.eyebrow{color:var(--gold);font-weight:600;letter-spacing:.08em;font-size:.8rem;
  text-transform:uppercase;margin-bottom:.4rem}
.muted{color:var(--muted)}
.grid{display:grid;gap:1.25rem}
.g2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.g4{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.pad{padding:1.15rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:48px;
  padding:.7rem 1.4rem;border-radius:999px;border:1px solid transparent;font:inherit;font-weight:600;
  cursor:pointer;transition:transform .15s ease,opacity .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.btn-brand{background:var(--brand);color:#fff}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.btn-wa{background:var(--wa);color:#04240f}
.nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;gap:1rem;min-height:68px}
.brand{display:flex;align-items:center;gap:.6rem;font-family:var(--display);font-weight:700;font-size:1.25rem}
.brand img{height:38px;width:auto}
.nav nav{margin-inline-start:auto;display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap}
.nav nav a{color:var(--muted);font-size:.95rem;padding:.4rem 0}
.nav nav a:hover,.nav nav a:focus-visible{color:var(--ink)}
.hero{position:relative;padding:5.5rem 0 4rem;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;
  background:radial-gradient(70% 90% at 50% 0%,color-mix(in srgb,var(--brand) 26%,transparent),transparent 70%)}
.hero>*{position:relative}
.hero-img{position:absolute;inset:0;object-fit:cover;width:100%;height:100%;opacity:.28}
.hero h1{font-size:clamp(2.2rem,6vw,4rem);margin-bottom:1rem}
.hero p{font-size:1.15rem;color:var(--muted);max-width:52ch}
.hero .cta{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1.8rem}
.stats{display:grid;gap:.9rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:3rem}
.stat{background:color-mix(in srgb,var(--surface) 80%,transparent);border:1px solid var(--line);
  border-radius:14px;padding:1rem;display:flex;gap:.6rem;align-items:center;font-weight:600;font-size:.95rem}
.stat span{font-size:1.5rem}
.cat{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1.3rem .8rem;text-align:center;
  background:var(--surface);border:1px solid var(--line);border-radius:16px;font-weight:600;min-height:48px}
.cat:hover,.cat:focus-visible{border-color:var(--brand)}
.cat span{font-size:1.9rem;line-height:1}
.item-media{aspect-ratio:4/3;background:linear-gradient(140deg,
  color-mix(in srgb,var(--brand) 30%,var(--surface)),var(--surface));
  display:flex;align-items:center;justify-content:center;font-size:2.6rem}
.item-media img{width:100%;height:100%;object-fit:cover}
.item h3{font-size:1.15rem;margin-bottom:.25rem}
.item p{margin:0 0 .8rem;color:var(--muted);font-size:.92rem}
.price{display:flex;align-items:baseline;gap:.5rem;font-weight:700;font-size:1.15rem;color:var(--gold)}
.price del{color:var(--muted);font-size:.85rem;font-weight:400}
.price .note{color:var(--brand);font-size:.95rem;font-weight:600}
.badge{position:absolute;inset-block-start:.7rem;inset-inline-start:.7rem;background:var(--brand);color:#fff;
  border-radius:999px;padding:.2rem .7rem;font-size:.75rem;font-weight:600}
.item{position:relative}
.offer{display:flex;flex-direction:column;gap:.5rem}
.offer .price-text{font-family:var(--display);font-size:1.6rem;color:var(--gold);font-weight:700}
.stars{color:var(--gold);letter-spacing:.1em}
.faq{border:1px solid var(--line);border-radius:14px;background:var(--surface);margin-bottom:.7rem}
.faq summary{cursor:pointer;padding:1rem 1.15rem;font-weight:600;min-height:48px;display:flex;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';margin-inline-start:auto;color:var(--brand);font-size:1.3rem}
.faq[open] summary::after{content:'−'}
.faq p{margin:0;padding:0 1.15rem 1.1rem;color:var(--muted)}
label{display:block;font-weight:600;font-size:.9rem;margin-bottom:.35rem}
input,select,textarea{width:100%;min-height:48px;padding:.7rem .9rem;border-radius:12px;
  border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--gold);outline-offset:1px}
textarea{min-height:96px;resize:vertical}
.field{margin-bottom:1rem}
.note{padding:.9rem 1.1rem;border-radius:12px;background:color-mix(in srgb,var(--brand) 12%,var(--surface));
  border:1px solid color-mix(in srgb,var(--brand) 35%,var(--line));font-size:.95rem}
.ok{background:color-mix(in srgb,var(--wa) 14%,var(--surface));
  border-color:color-mix(in srgb,var(--wa) 40%,var(--line))}
footer{border-top:1px solid var(--line);padding:2.5rem 0;color:var(--muted);font-size:.92rem}
.float-wa{position:fixed;inset-block-end:1.1rem;inset-inline-end:1.1rem;z-index:60;
  width:56px;height:56px;border-radius:50%;background:var(--wa);color:#04240f;display:flex;
  align-items:center;justify-content:center;font-size:1.6rem;box-shadow:0 8px 24px rgba(0,0,0,.35)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const MENU_CSS = `
.tabs{display:flex;gap:.6rem;overflow-x:auto;padding:.4rem 0 1.4rem;scrollbar-width:thin}
.tabs a{white-space:nowrap;padding:.6rem 1.1rem;border-radius:999px;border:1px solid var(--line);
  background:var(--surface);font-weight:600;font-size:.95rem;min-height:44px;display:flex;align-items:center}
.tabs a:hover,.tabs a:focus-visible{border-color:var(--brand)}
.opt{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}
.opt label{display:inline-flex;align-items:center;gap:.35rem;margin:0;padding:.4rem .75rem;border-radius:999px;
  border:1px solid var(--line);font-size:.85rem;font-weight:500;cursor:pointer;min-height:40px}
.opt input{width:auto;min-height:auto;margin:0}
.opt label:has(input:checked){border-color:var(--brand);background:color-mix(in srgb,var(--brand) 14%,transparent)}
.cart-bar{position:fixed;inset-block-end:0;inset-inline:0;z-index:70;background:var(--surface);
  border-top:1px solid var(--line);padding:.8rem 1rem;display:none;gap:.8rem;align-items:center}
.cart-bar.on{display:flex}
.cart-bar strong{font-size:1.05rem}
.cart-bar .btn{margin-inline-start:auto}
dialog{border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink);
  width:min(560px,calc(100% - 2rem));padding:0;max-height:88vh}
dialog::backdrop{background:rgba(0,0,0,.6)}
dialog .pad{padding:1.4rem}
.cart-line{display:flex;gap:.7rem;align-items:flex-start;padding:.7rem 0;border-bottom:1px solid var(--line)}
.cart-line .qty{margin-inline-start:auto;display:flex;align-items:center;gap:.5rem}
.qty button{width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--bg);
  color:var(--ink);font-size:1.1rem;cursor:pointer}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.timeline{display:flex;gap:.4rem;margin:1.2rem 0}
.timeline div{flex:1;height:6px;border-radius:999px;background:var(--line)}
.timeline div.on{background:var(--brand)}
`;

/* ==================== الهيكل ==================== */

export function layout({ settings, lang, title, description, body, extraCss = '', script = '', canonical = '' }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const og = settings.og_image_url || settings.hero_image_url || settings.logo_url;
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="restaurant.restaurant">
${og ? `<meta property="og:image" content="${escapeHtml(og)}">` : ''}
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
${settings.logo_url ? `<link rel="icon" href="${escapeHtml(settings.logo_url)}">` : ''}
${fontLink(settings)}
<style>${themeVars(settings, lang)}${BASE_CSS}${extraCss}</style>
</head>
<body>
${body}
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

const navLinks = (base, lang, settings) => [
  on(settings.show_about) && [`${base}#about`, t(settings, 'about_title', lang)],
  [`${base}menu`, t(settings, 'menu_title', lang)],
  on(settings.show_offers) && [`${base}#offers`, t(settings, 'offers_title', lang)],
  on(settings.show_reservation) && [`${base}#reserve`, t(settings, 'reservation_title', lang)],
].filter(Boolean);

function header(base, lang, settings, otherLangHref) {
  const name = t(settings, 'name', lang);
  return `<header class="nav"><div class="wrap">
<a class="brand" href="${base}">
${settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(name)}">` : ''}
<span>${escapeHtml(name)}</span></a>
<nav>
${navLinks(base, lang, settings).map(([href, label]) =>
    `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join('')}
<a href="${escapeHtml(otherLangHref)}" rel="alternate">${lang === 'ar' ? 'EN' : 'ع'}</a>
<a class="btn btn-brand" href="${base}menu">${escapeHtml(t(settings, 'order_cta', lang))}</a>
</nav></div></header>`;
}

function waHref(settings, text) {
  const number = String(settings.whatsapp_number || '').replace(/\D/g, '');
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(text || '')}`;
}

function footer(lang, settings) {
  const rows = [
    settings.phone && `<a href="tel:${escapeHtml(String(settings.phone).replace(/\s/g, ''))}">${escapeHtml(settings.phone)}</a>`,
    settings.email && `<a href="mailto:${escapeHtml(settings.email)}">${escapeHtml(settings.email)}</a>`,
    t(settings, 'address', lang) && escapeHtml(t(settings, 'address', lang)),
    t(settings, 'hours', lang) && escapeHtml(t(settings, 'hours', lang)),
  ].filter(Boolean);
  const social = [
    settings.instagram_url && `<a href="${escapeHtml(settings.instagram_url)}" rel="noopener">Instagram</a>`,
    settings.facebook_url && `<a href="${escapeHtml(settings.facebook_url)}" rel="noopener">Facebook</a>`,
  ].filter(Boolean);
  const wa = waHref(settings, '');
  return `<footer><div class="wrap grid g2">
<div><strong>${escapeHtml(t(settings, 'name', lang))}</strong><br>${escapeHtml(t(settings, 'tagline', lang))}</div>
<div>${rows.join('<br>')}</div>
<div>${social.join(' · ')}<br>${escapeHtml(t(settings, 'footer_text', lang))}</div>
</div></footer>
${wa ? `<a class="float-wa" href="${escapeHtml(wa)}" rel="noopener"
 aria-label="${escapeHtml(t(settings, 'whatsapp_panel_text', lang))}">✆</a>` : ''}`;
}

/* ==================== أجزاء مشتركة ==================== */

const media = (url, fallbackIcon) => `<div class="item-media">${
  url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async">` : escapeHtml(fallbackIcon || '🍽️')
}</div>`;

/**
 * سعر الصنف.
 *
 * الصنف غير المسعّر يعرض نصه لا صفرًا: «0.00» توحي بأنه مجاني، وهي أسوأ
 * كذبة يمكن أن تعرضها قائمة طعام.
 */
function priceBlock(item, lang, currency) {
  if (!on(item.is_priced)) {
    return `<div class="price"><span class="note">${
      escapeHtml(lang === 'ar' ? 'حسب الطلب' : 'On request')}</span></div>`;
  }
  const from = item.variants?.length
    ? Math.min(...item.variants.map((variant) => Number(variant.price_minor)))
    : Number(item.price_minor);
  const prefix = item.variants?.length ? (lang === 'ar' ? 'من ' : 'from ') : '';
  const old = Number(item.old_price_minor || 0);
  return `<div class="price"><span>${escapeHtml(prefix)}${escapeHtml(money(from, currency))}</span>${
    old > from ? `<del>${escapeHtml(money(old, currency))}</del>` : ''}</div>`;
}

function itemCard(item, lang, currency, addButton = '') {
  const badge = t(item, 'badge', lang);
  return `<article class="card item">
${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ''}
${media(item.image_url, '🍽️')}
<div class="pad">
<h3>${escapeHtml(t(item, 'name', lang))}</h3>
<p>${escapeHtml(t(item, 'description', lang))}</p>
${priceBlock(item, lang, currency)}
${addButton}
</div></article>`;
}

const section = (id, eyebrow, title, inner) =>
  `<section id="${id}"><div class="wrap">
${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
<h2>${escapeHtml(title)}</h2>
${inner}
</div></section>`;

/* ==================== الصفحة الرئيسية ==================== */

export function renderHome(site, { lang, base, planFull, canonical }) {
  const s = site.settings;
  const currency = s.currency || '₪';
  const otherLang = lang === 'ar' ? 'en' : 'ar';
  const featured = site.items.filter((item) => on(item.is_featured)).slice(0, 6);

  const hero = `<section class="hero">
${s.hero_image_url ? `<img class="hero-img" src="${escapeHtml(s.hero_image_url)}" alt="" fetchpriority="high">` : ''}
<div class="wrap">
<p class="eyebrow">${escapeHtml(t(s, 'tagline', lang))}</p>
<h1>${escapeHtml(t(s, 'hero_title', lang))}</h1>
<p>${escapeHtml(t(s, 'hero_text', lang))}</p>
<div class="cta">
<a class="btn btn-brand" href="${base}menu">${escapeHtml(t(s, 'order_cta', lang))}</a>
<a class="btn btn-ghost" href="${base}menu">${escapeHtml(t(s, 'menu_cta', lang))}</a>
${waHref(s, t(s, 'name', lang)) ? `<a class="btn btn-wa" href="${escapeHtml(waHref(s, t(s, 'name', lang)))}"
 rel="noopener">${escapeHtml(t(s, 'whatsapp_panel_text', lang))}</a>` : ''}
</div>
${site.heroStats.length ? `<div class="stats">${site.heroStats.map((stat) =>
    `<div class="stat"><span>${escapeHtml(stat.icon || '★')}</span>${escapeHtml(t(stat, 'title', lang))}</div>`).join('')}</div>` : ''}
</div></section>`;

  const parts = [hero];

  if (on(s.show_about) && t(s, 'about_text', lang)) {
    parts.push(section('about', t(s, 'tagline', lang), t(s, 'about_title', lang),
      `<p class="muted" style="max-width:70ch;font-size:1.05rem">${escapeHtml(t(s, 'about_text', lang))}</p>`));
  }

  if (on(s.show_categories) && site.categories.length) {
    parts.push(section('categories', '', t(s, 'menu_title', lang),
      `<div class="grid g4">${site.categories.map((category) =>
        `<a class="cat" href="${base}menu#c-${escapeHtml(category.slug)}">
<span>${escapeHtml(category.icon || '🍽️')}</span>${escapeHtml(t(category, 'name', lang))}</a>`).join('')}</div>`));
  }

  if (on(s.show_featured) && featured.length) {
    parts.push(section('featured', '', t(s, 'featured_title', lang),
      `<div class="grid g3">${featured.map((item) => itemCard(item, lang, currency)).join('')}</div>`));
  }

  if (on(s.show_offers) && site.offers.length) {
    parts.push(section('offers', '', t(s, 'offers_title', lang),
      `<div class="grid g3">${site.offers.map((offer) => {
        const priceText = on(offer.is_priced)
          ? money(offer.price_minor, currency)
          : t(offer, 'price_text', lang);
        const oldText = t(offer, 'old_price_text', lang);
        return `<article class="card"><div class="pad offer">
<h3>${escapeHtml(t(offer, 'title', lang))}</h3>
<p class="muted">${escapeHtml(t(offer, 'description', lang))}</p>
<div class="price-text">${escapeHtml(priceText)}${
  oldText ? ` <del class="muted" style="font-size:1rem">${escapeHtml(oldText)}</del>` : ''}</div>
</div></article>`;
      }).join('')}</div>`));
  }

  if (on(s.show_services) && site.services.length) {
    parts.push(section('services', '', t(s, 'services_title', lang),
      `<div class="grid g4">${site.services.map((service) =>
        `<div class="card pad"><div style="font-size:2rem">${escapeHtml(service.icon || '✦')}</div>
<h3>${escapeHtml(t(service, 'title', lang))}</h3>
<p class="muted">${escapeHtml(t(service, 'description', lang))}</p></div>`).join('')}</div>`));
  }

  if (on(s.show_reviews) && site.testimonials.length) {
    parts.push(section('reviews', '', t(s, 'reviews_title', lang),
      `<div class="grid g3">${site.testimonials.map((review) =>
        `<div class="card pad">
<div class="stars" aria-label="${review.rating}/5">${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}</div>
<p>${escapeHtml(t(review, 'review', lang))}</p>
<strong>${escapeHtml(review.customer_name)}</strong></div>`).join('')}</div>`));
  }

  if (on(s.show_reservation)) {
    parts.push(section('reserve', '', t(s, 'reservation_title', lang), planFull
      ? reservationForm(s, lang, base)
      : `<p class="muted">${escapeHtml(t(s, 'reservation_text', lang))}</p>
${waHref(s, lang === 'ar' ? 'أريد حجز طاولة' : 'I would like to book a table')
        ? `<a class="btn btn-wa" href="${escapeHtml(waHref(s, lang === 'ar' ? 'أريد حجز طاولة' : 'I would like to book a table'))}"
 rel="noopener">${escapeHtml(t(s, 'whatsapp_panel_text', lang))}</a>` : ''}`));
  }

  if (on(s.show_faq) && site.faqs.length) {
    parts.push(section('faq', '', t(s, 'faq_title', lang),
      site.faqs.map((faq) => `<details class="faq"><summary>${escapeHtml(t(faq, 'question', lang))}</summary>
<p>${escapeHtml(t(faq, 'answer', lang))}</p></details>`).join('')));
  }

  if (on(s.show_social) && site.socialPosts.length) {
    parts.push(section('social', '', t(s, 'social_title', lang),
      `<div class="grid g4">${site.socialPosts.map((post) =>
        `<a class="card" href="${escapeHtml(post.post_url || '#')}" rel="noopener">
${media(post.image_url, '📷')}</a>`).join('')}</div>`));
  }

  return layout({
    settings: s,
    lang,
    title: t(s, 'seo_title', lang) || t(s, 'name', lang),
    description: t(s, 'seo_description', lang),
    canonical,
    body: header(base, lang, s, `${base}?lang=${otherLang}`) + parts.join('') + footer(lang, s),
    script: on(s.show_reservation) && planFull ? RESERVATION_JS : '',
  });
}

function reservationForm(s, lang, base) {
  const ar = lang === 'ar';
  return `<p class="muted">${escapeHtml(t(s, 'reservation_text', lang))}</p>
<form id="resform" class="card pad" style="max-width:640px" data-action="${base}api/reservations">
<div class="grid g2">
<div class="field"><label for="rn">${ar ? 'الاسم' : 'Name'}</label>
<input id="rn" name="full_name" required maxlength="80" autocomplete="name"></div>
<div class="field"><label for="rp">${ar ? 'رقم الهاتف' : 'Phone'}</label>
<input id="rp" name="phone" required maxlength="30" inputmode="tel" autocomplete="tel"></div>
<div class="field"><label for="rd">${ar ? 'التاريخ' : 'Date'}</label>
<input id="rd" name="date" type="date" required></div>
<div class="field"><label for="rt">${ar ? 'الوقت' : 'Time'}</label>
<input id="rt" name="time" type="time" required
 min="${escapeHtml(s.reservation_open_time)}" max="${escapeHtml(s.reservation_close_time)}"></div>
<div class="field"><label for="rg">${ar ? 'عدد الضيوف' : 'Guests'}</label>
<input id="rg" name="guests" type="number" min="1" max="50" value="2" required></div>
<div class="field"><label for="ro">${ar ? 'المناسبة (اختياري)' : 'Occasion (optional)'}</label>
<input id="ro" name="occasion" maxlength="60"></div>
</div>
<div class="field"><label for="rnote">${ar ? 'ملاحظات' : 'Notes'}</label>
<textarea id="rnote" name="notes" maxlength="300"></textarea></div>
<button class="btn btn-brand" type="submit">${ar ? 'أرسل طلب الحجز' : 'Send booking request'}</button>
<p id="resmsg" role="status" style="margin:.9rem 0 0"></p>
</form>`;
}

const RESERVATION_JS = `
(function(){
  var form=document.getElementById('resform');
  if(!form)return;
  var msg=document.getElementById('resmsg');
  var today=new Date().toISOString().slice(0,10);
  var date=form.querySelector('input[name=date]');
  date.min=today;
  form.addEventListener('submit',function(event){
    event.preventDefault();
    var button=form.querySelector('button');
    button.disabled=true;
    msg.className='';
    msg.textContent='...';
    var payload={};
    new FormData(form).forEach(function(value,key){payload[key]=value;});
    fetch(form.dataset.action,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)})
      .then(function(response){return response.json().then(function(data){return {ok:response.ok,data:data};});})
      .then(function(result){
        if(result.ok&&result.data.ok){
          form.reset();
          date.min=today;
          msg.className='note ok';
          msg.textContent=result.data.message;
        }else{
          msg.className='note';
          msg.textContent=result.data.message||'تعذّر إرسال الحجز.';
        }
      })
      .catch(function(){msg.className='note';msg.textContent='تعذّر الاتصال. حاول مرة أخرى.';})
      .then(function(){button.disabled=false;});
  });
})();`;

/* ==================== صفحة المنيو ==================== */

export function renderMenu(site, { lang, base, planFull, canonical }) {
  const s = site.settings;
  const currency = s.currency || '₪';
  const ar = lang === 'ar';
  const otherLang = ar ? 'en' : 'ar';

  const byCategory = new Map(site.categories.map((category) => [category.id, []]));
  for (const item of site.items) {
    if (byCategory.has(item.category_id)) byCategory.get(item.category_id).push(item);
  }

  const tabs = `<div class="tabs">${site.categories.map((category) =>
    `<a href="#c-${escapeHtml(category.slug)}">${escapeHtml(category.icon || '')} ${
      escapeHtml(t(category, 'name', lang))}</a>`).join('')}</div>`;

  const blocks = site.categories.map((category) => {
    const items = byCategory.get(category.id) || [];
    if (!items.length) return '';
    return `<h2 id="c-${escapeHtml(category.slug)}" style="margin-top:2.5rem">${
      escapeHtml(t(category, 'name', lang))}</h2>
<div class="grid g3">${items.map((item) => itemCard(item, lang, currency, addControls(item, lang, currency, ar))).join('')}</div>`;
  }).join('');

  const cartBar = `<div class="cart-bar" id="cartbar" role="region" aria-live="polite">
<strong id="cartcount">0</strong>
<span id="carttotal" class="muted"></span>
<button class="btn btn-brand" id="opencart" type="button">${ar ? 'إتمام الطلب' : 'Checkout'}</button>
</div>`;

  const dialog = `<dialog id="cartdialog" aria-labelledby="cartTitle"><form method="dialog"></form>
<div class="pad">
<h2 id="cartTitle">${ar ? 'طلبك' : 'Your order'}</h2>
<div id="cartlines"></div>
<p class="price" style="justify-content:space-between;margin:1rem 0">
<span>${ar ? 'الإجمالي' : 'Total'}</span><span id="cartsum">—</span></p>
${planFull ? checkoutForm(s, lang, base, ar) : whatsappOnly(s, lang, ar)}
<button class="btn btn-ghost" type="button" data-close style="margin-top:.8rem;width:100%">${
  ar ? 'إغلاق' : 'Close'}</button>
</div></dialog>`;

  return layout({
    settings: s,
    lang,
    title: `${t(s, 'menu_title', lang)} — ${t(s, 'name', lang)}`,
    description: t(s, 'seo_description', lang),
    canonical,
    extraCss: MENU_CSS,
    body: header(base, lang, s, `${base}menu?lang=${otherLang}`)
      + `<section><div class="wrap"><h1>${escapeHtml(t(s, 'menu_title', lang))}</h1>${tabs}${blocks}</div></section>`
      + cartBar + dialog + footer(lang, s),
    script: menuScript(base, currency, planFull, ar, s),
  });
}

/**
 * خيارات الصنف وزر الإضافة.
 *
 * الأسعار هنا للعرض وحدها. الخادم يعيد حسابها من قاعدة البيانات عند الإرسال،
 * فلا يشتري أحد كباب بشيكل بتعديل الصفحة.
 */
function addControls(item, lang, currency, ar) {
  if (!Number(item.is_priced)) {
    return `<button class="btn btn-ghost" type="button" disabled style="width:100%">${
      ar ? 'اسأل عن السعر' : 'Ask for price'}</button>`;
  }
  const name = `v_${item.id}`;
  const variants = item.variants.length ? `<div class="opt" role="radiogroup" aria-label="${
    ar ? 'الحجم' : 'Size'}">${item.variants.map((variant, index) =>
    `<label><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(variant.id)}"${
      index === 0 ? ' checked' : ''}> ${escapeHtml(t(variant, 'name', lang))} · ${
      escapeHtml(money(variant.price_minor, currency))}</label>`).join('')}</div>` : '';
  const addons = item.addons.length ? `<div class="opt">${item.addons.map((addon) =>
    `<label><input type="checkbox" name="a_${escapeHtml(item.id)}" value="${escapeHtml(addon.id)}"> ${
      escapeHtml(t(addon, 'name', lang))} +${escapeHtml(money(addon.price_minor, currency))}</label>`).join('')}</div>` : '';
  return `${variants}${addons}
<button class="btn btn-brand" type="button" data-add="${escapeHtml(item.id)}"
 data-name="${escapeHtml(t(item, 'name', lang))}" data-price="${Number(item.price_minor)}"
 style="width:100%;margin-top:.6rem">${ar ? 'أضف' : 'Add'}</button>`;
}

function checkoutForm(s, lang, base, ar) {
  return `<form id="orderform" data-action="${base}api/orders">
<div class="field"><label for="on">${ar ? 'الاسم' : 'Name'}</label>
<input id="on" name="customer_name" required maxlength="80" autocomplete="name"></div>
<div class="field"><label for="op">${ar ? 'رقم الهاتف' : 'Phone'}</label>
<input id="op" name="phone" required maxlength="30" inputmode="tel" autocomplete="tel"></div>
<div class="field"><label for="of">${ar ? 'الاستلام' : 'Fulfillment'}</label>
<select id="of" name="fulfillment">
<option value="delivery">${ar ? 'توصيل' : 'Delivery'}</option>
<option value="pickup">${ar ? 'استلام من المطعم' : 'Pickup'}</option>
</select></div>
<div class="field" id="addrfield"><label for="oa">${ar ? 'العنوان' : 'Address'}</label>
<input id="oa" name="address" maxlength="200" autocomplete="street-address"></div>
<div class="field"><label for="onotes">${ar ? 'ملاحظات' : 'Notes'}</label>
<textarea id="onotes" name="notes" maxlength="300"></textarea></div>
<button class="btn btn-brand" type="submit" style="width:100%">${ar ? 'أرسل الطلب' : 'Send order'}</button>
<p id="ordermsg" role="status" style="margin:.9rem 0 0"></p>
</form>`;
}

/**
 * باقة المنيو: لا طلب يُحفظ على الخادم.
 *
 * الزر يفتح واتساب برسالة مبنيّة في المتصفح. هذا هو الفرق التجاري بين
 * الباقتين، وهو مفروض على الخادم أيضًا: مسار الطلبات يرد 402 لهذه الباقة.
 */
function whatsappOnly(s, lang, ar) {
  return `<p class="note">${ar
    ? 'يُرسَل طلبك إلى المطعم عبر واتساب مباشرة.'
    : 'Your order is sent to the restaurant directly over WhatsApp.'}</p>
<button class="btn btn-wa" type="button" id="wasend" style="width:100%">${
  escapeHtml(t(s, 'whatsapp_panel_text', lang))}</button>`;
}

function menuScript(base, currency, planFull, ar, s) {
  const number = String(s.whatsapp_number || '').replace(/\D/g, '');
  return `
(function(){
  var CURRENCY=${JSON.stringify(currency)};
  var AR=${ar ? 'true' : 'false'};
  var FULL=${planFull ? 'true' : 'false'};
  var WA=${JSON.stringify(number)};
  var cart=[];
  var bar=document.getElementById('cartbar');
  var dialog=document.getElementById('cartdialog');

  function fmt(minor){return (minor/100).toFixed(2)+' '+CURRENCY;}

  function label(button){
    var card=button.closest('.item');
    var variant=card.querySelector('input[type=radio]:checked');
    var addons=[].slice.call(card.querySelectorAll('input[type=checkbox]:checked'));
    return {
      item_id:button.dataset.add,
      variant_id:variant?variant.value:'',
      addon_ids:addons.map(function(input){return input.value;}),
      name:button.dataset.name,
      variant_text:variant?variant.parentNode.textContent.trim():'',
      addon_text:addons.map(function(input){return input.parentNode.textContent.trim();}),
      // السعر للعرض فقط. الخادم يحسب من جديد.
      preview:previewPrice(button,variant,addons),
      quantity:1
    };
  }

  function previewPrice(button,variant,addons){
    var price=Number(button.dataset.price);
    if(variant){
      var text=variant.parentNode.textContent;
      var found=text.match(/([0-9]+\\.[0-9]{2})/);
      if(found)price=Math.round(parseFloat(found[1])*100);
    }
    addons.forEach(function(input){
      var found=input.parentNode.textContent.match(/\\+([0-9]+\\.[0-9]{2})/);
      if(found)price+=Math.round(parseFloat(found[1])*100);
    });
    return price;
  }

  function key(line){return line.item_id+'|'+line.variant_id+'|'+line.addon_ids.slice().sort().join(',');}

  function add(button){
    var line=label(button);
    var existing=cart.filter(function(entry){return key(entry)===key(line);})[0];
    if(existing)existing.quantity+=1; else cart.push(line);
    render();
  }

  function render(){
    var count=cart.reduce(function(sum,line){return sum+line.quantity;},0);
    var total=cart.reduce(function(sum,line){return sum+line.preview*line.quantity;},0);
    bar.classList.toggle('on',count>0);
    document.getElementById('cartcount').textContent=count+(AR?' صنفًا':' items');
    document.getElementById('carttotal').textContent=fmt(total);
    var sum=document.getElementById('cartsum');
    if(sum)sum.textContent=fmt(total);
    var host=document.getElementById('cartlines');
    if(!host)return;
    host.innerHTML='';
    cart.forEach(function(line,index){
      var row=document.createElement('div');
      row.className='cart-line';
      var meta=[line.variant_text].concat(line.addon_text).filter(Boolean).join(' · ');
      var text=document.createElement('div');
      text.innerHTML='<strong></strong><br><span class="muted" style="font-size:.85rem"></span>';
      text.querySelector('strong').textContent=line.name;
      text.querySelector('span').textContent=meta;
      row.appendChild(text);
      var qty=document.createElement('div');
      qty.className='qty';
      var minus=document.createElement('button');
      minus.type='button';minus.textContent='−';
      minus.setAttribute('aria-label',AR?'إنقاص':'Decrease');
      minus.onclick=function(){line.quantity-=1;if(line.quantity<1)cart.splice(index,1);render();};
      var value=document.createElement('span');value.textContent=line.quantity;
      var plus=document.createElement('button');
      plus.type='button';plus.textContent='+';
      plus.setAttribute('aria-label',AR?'زيادة':'Increase');
      plus.onclick=function(){if(line.quantity<99){line.quantity+=1;render();}};
      qty.appendChild(minus);qty.appendChild(value);qty.appendChild(plus);
      row.appendChild(qty);
      host.appendChild(row);
    });
  }

  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-add]');
    if(button)add(button);
    if(event.target.closest('[data-close]'))dialog.close();
  });

  document.getElementById('opencart').onclick=function(){render();dialog.showModal();};

  var fulfillment=document.getElementById('of');
  if(fulfillment){
    var addressField=document.getElementById('addrfield');
    var sync=function(){
      var delivery=fulfillment.value==='delivery';
      addressField.hidden=!delivery;
      document.getElementById('oa').required=delivery;
    };
    fulfillment.onchange=sync;sync();
  }

  var waButton=document.getElementById('wasend');
  if(waButton){
    waButton.onclick=function(){
      var lines=cart.map(function(line){
        var meta=[line.variant_text].concat(line.addon_text).filter(Boolean).join(' · ');
        return '• '+line.quantity+' × '+line.name+(meta?' ('+meta+')':'');
      }).join('\\n');
      var text=(AR?'طلب جديد:\\n':'New order:\\n')+lines;
      window.open('https://wa.me/'+WA+'?text='+encodeURIComponent(text),'_blank','noopener');
    };
  }

  var form=document.getElementById('orderform');
  if(form&&FULL){
    form.addEventListener('submit',function(event){
      event.preventDefault();
      if(!cart.length)return;
      var button=form.querySelector('button[type=submit]');
      var msg=document.getElementById('ordermsg');
      button.disabled=true;msg.className='';msg.textContent='...';
      var payload={lines:cart.map(function(line){
        return {item_id:line.item_id,variant_id:line.variant_id,
          addon_ids:line.addon_ids,quantity:line.quantity};
      })};
      new FormData(form).forEach(function(value,name){payload[name]=value;});
      fetch(form.dataset.action,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)})
        .then(function(response){return response.json().then(function(data){return {ok:response.ok,data:data};});})
        .then(function(result){
          if(result.ok&&result.data.ok){
            window.location.href=${JSON.stringify(base)}+'order/'+result.data.token;
          }else{
            msg.className='note';
            msg.textContent=result.data.message||(AR?'تعذّر إرسال الطلب.':'Could not send the order.');
            button.disabled=false;
          }
        })
        .catch(function(){
          msg.className='note';
          msg.textContent=AR?'تعذّر الاتصال. حاول مرة أخرى.':'Connection failed. Try again.';
          button.disabled=false;
        });
    });
  }
})();`;
}

/* ==================== صفحة حالة الطلب ==================== */

const STATUS_STEPS = ['new', 'confirmed', 'preparing', 'delivered'];

const STATUS_TEXT = {
  ar: { new: 'استلمنا طلبك', confirmed: 'تم التأكيد', preparing: 'قيد التحضير',
    delivered: 'تم التسليم', cancelled: 'أُلغي الطلب' },
  en: { new: 'Order received', confirmed: 'Confirmed', preparing: 'Preparing',
    delivered: 'Delivered', cancelled: 'Cancelled' },
};

export function renderOrder(site, order, lines, { lang, base, planFull }) {
  const s = site.settings;
  const currency = order.currency || '₪';
  const ar = lang === 'ar';
  const stepIndex = STATUS_STEPS.indexOf(order.status);

  const rows = lines.map((line) => {
    let addons = [];
    try {
      addons = JSON.parse(line.addons_json || '[]');
    } catch { /* سطر بإضافات تالفة يُعرض بلا إضافات */ }
    const meta = [line.variant_name_ar, ...addons.map((addon) => addon.name_ar)].filter(Boolean).join(' · ');
    return `<div class="cart-line"><div>
<strong>${escapeHtml(t(line, 'name', lang))}</strong>
${meta ? `<br><span class="muted" style="font-size:.85rem">${escapeHtml(meta)}</span>` : ''}
</div><div class="qty">${line.quantity} × ${
  Number(line.is_priced) ? escapeHtml(money(line.unit_price_minor, currency))
    : `<span class="note">${escapeHtml(line.price_note || (ar ? 'حسب الطلب' : 'On request'))}</span>`}</div></div>`;
  }).join('');

  const body = `<section><div class="wrap" style="max-width:680px">
<p class="eyebrow">${ar ? 'رقم الطلب' : 'Order code'}</p>
<h1 style="letter-spacing:.05em">${escapeHtml(order.code)}</h1>
<p class="muted">${escapeHtml(STATUS_TEXT[lang][order.status] || order.status)}</p>
${order.status === 'cancelled' ? '' : `<div class="timeline" role="img"
 aria-label="${escapeHtml(STATUS_TEXT[lang][order.status] || '')}">${
  STATUS_STEPS.map((_, index) => `<div class="${index <= stepIndex ? 'on' : ''}"></div>`).join('')}</div>`}
<div class="card pad">${rows}
<p class="price" style="justify-content:space-between;margin-top:1rem">
<span>${ar ? 'الإجمالي' : 'Total'}</span><span>${escapeHtml(money(order.total_minor, currency))}</span></p>
${Number(order.has_unpriced_lines) ? `<p class="note">${ar
    ? 'يشمل أصنافًا يُحدَّد سعرها عند التحضير.'
    : 'Includes items priced on preparation.'}</p>` : ''}
</div>
${order.notes ? `<p class="muted">${ar ? 'ملاحظتك' : 'Your note'}: ${escapeHtml(order.notes)}</p>` : ''}
<div class="cta" style="display:flex;gap:.7rem;flex-wrap:wrap;margin-top:1.4rem">
${planFull ? `<a class="btn btn-ghost" href="${base}order/${escapeHtml(order.token)}/receipt.png"
 download>${ar ? 'حفظ الإيصال صورة' : 'Save receipt image'}</a>` : ''}
${waHref(s, `${ar ? 'استفسار عن الطلب' : 'Question about order'} ${order.code}`)
    ? `<a class="btn btn-wa" href="${escapeHtml(waHref(s, `${ar ? 'استفسار عن الطلب' : 'Question about order'} ${order.code}`))}"
 rel="noopener">${escapeHtml(t(s, 'whatsapp_panel_text', lang))}</a>` : ''}
<a class="btn btn-brand" href="${base}menu">${escapeHtml(t(s, 'order_cta', lang))}</a>
</div>
</div></section>`;

  return layout({
    settings: s,
    lang,
    title: `${order.code} — ${t(s, 'name', lang)}`,
    description: t(s, 'seo_description', lang),
    extraCss: MENU_CSS,
    body: header(base, lang, s, `${base}order/${order.token}?lang=${ar ? 'en' : 'ar'}`) + body + footer(lang, s),
  });
}

/* ==================== صفحات الأعذار ==================== */

/**
 * صفحة بديلة حين لا يوجد إعدادات — مطعم موقوف أو رابط خاطئ.
 *
 * لا تكشف أيهما: «موقوف لعدم الدفع» على صفحة عامة يقرؤها زبائن المطعم
 * ومنافسوه. الفرق التجاري يظهر في اللوحة لا على الرصيف.
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
