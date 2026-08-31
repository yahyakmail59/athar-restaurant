/**
 * كل هوية مقروءة — يُقاس تباينها لا يُنظر إليه.
 *
 * لماذا هذا الملف موجود: الهوية تُطبَّق مرّة عند الإنشاء، ثم يفتح صاحب
 * المطعم موقعه فيجد نصًّا لا يُقرأ — ولا يعرف أن السبب اختيارٌ في قائمة
 * ضغطها المشغّل قبل أسبوع. والعطل هنا لا يظهر في اختبار وظيفيّ: الصفحة
 * تُرسَم، والطلب يصل، والنصّ موجود في الوسم — وغير مرئيّ.
 *
 * وقد كان المحرك داكنًا في بنيته: `style.css` يُعرّف `--text` و`--muted`
 * و`--line` بقيم داكنة و`rootVars` لا تُبدّلها، فأيّ هوية فاتحة كانت
 * تُنتج أبيضَ على أبيض. صارت تُحقَن، وهذا الحارس يُثبّت ألّا تعود.
 *
 * المعيار 4.5:1 للنصّ العاديّ و3:1 للخافت — عتبتا WCAG AA للنصّ وللنصّ
 * الكبير. والخافت وصفٌ ثانويّ لا يُقرأ منه قرار، فيُقاس بالأدنى.
 *
 * التشغيل: node worker/tests/brandkits.contract.mjs
 */

import { BRAND_KITS, BRAND_KIT_ORDER, DEFAULT_BRAND_KIT, resolveBrandKit, brandKitChoices } from '../brandkits.js';
import { ARABIC_FONTS, ARABIC_DISPLAY_FONTS, DISPLAY_FONTS, LATIN_FONTS } from '../fonts.js';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** إضاءة نسبية من `#rrggbb`. */
function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const channel = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255)
    + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a === null || b === null) return null;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- 1) التباين ---------- */

for (const code of BRAND_KIT_ORDER) {
  const kit = BRAND_KITS[code];
  const onPage = ratio(kit.text_color, kit.background_color);
  const onCard = ratio(kit.text_color, kit.surface_color);
  const mutedOnCard = ratio(kit.muted_color, kit.surface_color);
  const worst = Math.min(onPage ?? 0, onCard ?? 0);

  check(
    `${kit.label} — النصّ`,
    worst >= 4.5,
    `أرضية ${(onPage ?? 0).toFixed(2)} · سطح ${(onCard ?? 0).toFixed(2)}`,
  );
  check(
    `${kit.label} — الخافت`,
    (mutedOnCard ?? 0) >= 3,
    `${(mutedOnCard ?? 0).toFixed(2)} على السطح`,
  );
}

/* ---------- 2) الوضع يطابق الأرقام ---------- */

for (const code of BRAND_KIT_ORDER) {
  const kit = BRAND_KITS[code];
  const dark = (luminance(kit.background_color) ?? 0) < 0.5;
  check(
    `${kit.label} — الوضع مُعلَن بصدق`,
    (kit.mode === 'dark') === dark,
    `مكتوب ${kit.mode}، وأرضيته ${dark ? 'داكنة' : 'فاتحة'}`,
  );
}

/* ---------- 3) الخطوط من السجلّ لا من الخيال ---------- */

const registries = {
  arabic_font: ARABIC_FONTS,
  arabic_display_font: ARABIC_DISPLAY_FONTS,
  display_font: DISPLAY_FONTS,
  latin_font: LATIN_FONTS,
};

const badFonts = [];
for (const code of BRAND_KIT_ORDER) {
  for (const [field, registry] of Object.entries(registries)) {
    const key = BRAND_KITS[code][field];
    if (!registry[key]) badFonts.push(`${code}.${field}=${key}`);
  }
}
check(
  'كل خطّ مسجَّل في `fonts.js`',
  badFonts.length === 0,
  badFonts.join(', ') || 'خطٌّ غير مسجَّل لا يُحمَّل، فتسقط الصفحة إلى خطّ النظام بلا رسالة',
);

/* ---------- 4) الاكتمال ---------- */

const REQUIRED = ['label', 'description', 'mode', 'primary_color', 'gold_color',
  'background_color', 'surface_color', 'text_color', 'muted_color', 'line_color',
  'whatsapp_color', 'arabic_font', 'arabic_display_font', 'display_font', 'latin_font'];

const incomplete = [];
for (const code of BRAND_KIT_ORDER) {
  for (const field of REQUIRED) {
    if (!BRAND_KITS[code][field] && BRAND_KITS[code][field] !== '') incomplete.push(`${code}.${field}`);
  }
}
check('كل هوية كاملة الحقول', incomplete.length === 0, incomplete.join(', ') || `${REQUIRED.length} حقلًا`);

check(
  'والترتيب يغطّي البنك كلّه',
  BRAND_KIT_ORDER.length === Object.keys(BRAND_KITS).length,
  `${BRAND_KIT_ORDER.length} في الترتيب · ${Object.keys(BRAND_KITS).length} في البنك`,
);

/* ---------- 5) الأسماء القديمة لا تسقط بصمت ---------- */

check(
  'الاسم القديم يُحلّ إلى خلفه لا إلى الافتراضيّة',
  resolveBrandKit('adana_classic') === BRAND_KITS.adana_b12,
  'مطعمٌ أُنشئ بالاسم القديم يبقى يحمله في صفّ المستأجر',
);

check(
  'ورمز مجهول يسقط إلى الافتراضية',
  resolveBrandKit('لا-وجود-له') === BRAND_KITS[DEFAULT_BRAND_KIT],
);

/* ---------- 6) القائمة التي تراها اللوحة ---------- */

const choices = brandKitChoices();
check(
  'القائمة تحمل ما تحتاجه اللوحة',
  choices.length === BRAND_KIT_ORDER.length
  && choices.every((c) => c.code && c.label && c.description && c.mode),
  `${choices.length} خيارًا، ولكلٍّ رمزٌ واسمٌ ووصفٌ ووضع`,
);

/* ---------- 7) الوضعان معًا معروضان ---------- */

const modes = new Set(BRAND_KIT_ORDER.map((c) => BRAND_KITS[c].mode));
check(
  'البنك يعرض الوضعين',
  modes.has('dark') && modes.has('light'),
  'بنكٌ داكن كلّه يُغلق سوق الكافيهات والمخابز التي ترفض الداكن',
);

const failed = checks.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} فحصًا فشل.`);
  process.exit(1);
}
console.log('\nrestaurant-brandkits-contract-ok');
