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
import { readFileSync } from 'node:fs';
import { inkFor } from '../colors.js';
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

/* ---------- 1ب) شارة السلّة: الحبر موصول لا محسوب فقط ---------- */

/*
 * `--whatsapp` ليس لونَ زرٍّ فحسب — عليه تجلس شارة عدد السلّة في الترويسة.
 * وكانت ترث حبر الزرّ الأحمر تحتها: أبيضَ على أخضر واتساب `#25D366` بنسبة
 * 1.98 — في الهويات الداكنة كلّها لا في الفاتحة وحدها. قِيست في المتصفح.
 *
 * والعلاج حبرٌ محسوب للأخضر نفسه: `--whatsapp-ink`. ولمّا صار محسوبًا لم
 * يعد قياسُ التباين حارسًا — `inkFor` تختار الأنسب من الأسود والأبيض،
 * فيَعبُر كلُّ أخضرَ إلا رماديًّا وسطًا نادرًا. جُرِّب: `#6E9E88` عبَر
 * بـ6.21، و`#7CE0A5` بـ11.75. فحارسٌ لا يسقط ليس حارسًا.
 *
 * فالمحروس هنا **الوصل** لا الحساب: أن يُصدِر المحرك الرمز، وأن تستهلكه
 * قاعدةُ الشارة. حذفُ أيّهما يعيد الوراثة الصامتة — ولا شيء يُخطئ.
 */

const renderSource = readFileSync(new URL('../render.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../../public/site/css/style.css', import.meta.url), 'utf8');

check(
  'المحرك يُصدِر `--whatsapp-ink`',
  /--whatsapp-ink:\$\{inkFor\(wa,/.test(renderSource),
  'بلا الرمز تسقط القاعدة إلى الوراثة: حبرُ الزرّ الأحمر على الأخضر',
);

const badgeRule = /\.header-whatsapp em\s*\{([^}]*)\}/.exec(styleSource);
check(
  'وقاعدة الشارة تستهلكه',
  Boolean(badgeRule) && /color:\s*var\(--whatsapp-ink\)/.test(badgeRule[1]),
  badgeRule ? 'قاعدة `.header-whatsapp em` موجودة' : 'قاعدة `.header-whatsapp em` غير موجودة أصلًا',
);

/* والحساب يبقى أرضيةً دنيا: أخضرُ رماديٌّ وسط لا يحتمل حبرًا أصلًا. */
for (const code of BRAND_KIT_ORDER) {
  const kit = BRAND_KITS[code];
  const ink = inkFor(kit.whatsapp_color, '#25D366');
  const badge = ratio(ink, kit.whatsapp_color);
  check(
    `${kit.label} — شارة السلّة`,
    (badge ?? 0) >= 4.5,
    `${(badge ?? 0).toFixed(2)} · حبرها ${ink} على ${kit.whatsapp_color}`,
  );
}

/* ---------- 1ج) لا اسمَ متقاعدًا يُكتب في صفٍّ جديد ---------- */

/*
 * كان المهيّئ يكتب `'adana_classic'` حين لا تُرسِل اللوحة رمزًا. والاسم
 * يُحلّ عبر `ALIASES` فلا شيء ينكسر — لكنه يُخزَّن في صفّ المطعم، فتمتلئ
 * القاعدة بأسماء متقاعدة ويُقرأ التقرير عليها.
 */

const adapterSource = readFileSync(new URL('../adapter.js', import.meta.url), 'utf8');
const retiredWrite = /brandKitCode \|\| '([a-z0-9_]+)'/.exec(adapterSource);
check(
  'المهيّئ يسقط إلى الافتراضيّة بالرمز لا بالنصّ',
  !retiredWrite,
  retiredWrite ? `يكتب '${retiredWrite[1]}' نصًّا` : 'يستعمل `DEFAULT_BRAND_KIT`',
);

/* ---------- 1د) لا هويّتان متشابهتان ---------- */

/*
 * لماذا: كانت في القائمة «شبيه أضنة و B12» — خيارٌ واحد لمطعمين، لأن
 * ملفَّي CSS عندهما متطابقان في ثمانية عشر رمزًا. والقياس الأعمق قال غير
 * ذلك: شعار B12 أحمرُ وأبيضُ على أسود بلا ذهب، ودليلُ علامة أضنة يكتب
 * صراحةً كحليّ `#0B1D2D` وذهبيّ `#D4AF37`. فالتطابق كان في الشيفرة
 * المنسوخة لا في العلامتين — أضنة بُنيت على باك-إند B12.
 *
 * وهذا الفحص يمنع عودة التوأمين: خياران متشابهان في قائمةٍ يبيعها مشغّل
 * لا يُضيفان اختيارًا، بل يجعلانه يظنّ أنه اختار ثم يجد ما لم يختر.
 *
 * المسافة إقليدية في RGB — لا CIEDE2000. الغاية «هل يراهما المشغّل
 * مختلفتين في قائمة» لا دقّةُ علم الألوان، والعتبة مُعايَرة على أقرب
 * زوجٍ باقٍ فعلًا.
 */

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const channels = (hex) => {
  const m = HEX.exec(String(hex || ''));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const distance = (a, b) => {
  const x = channels(a);
  const y = channels(b);
  if (!x || !y) return 0;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

const MIN_DISTANCE = 60;
const twins = [];
let closest = { pair: '', value: Infinity };

for (let i = 0; i < BRAND_KIT_ORDER.length; i += 1) {
  for (let j = i + 1; j < BRAND_KIT_ORDER.length; j += 1) {
    const a = BRAND_KITS[BRAND_KIT_ORDER[i]];
    const b = BRAND_KITS[BRAND_KIT_ORDER[j]];
    // أقربُ ما بينهما: هويتان تفترقان في الأرضية وحدها ما زالتا مختلفتين.
    const apart = Math.max(
      distance(a.primary_color, b.primary_color),
      distance(a.background_color, b.background_color),
    );
    const pair = `${BRAND_KIT_ORDER[i]} ↔ ${BRAND_KIT_ORDER[j]}`;
    if (apart < closest.value) closest = { pair, value: apart };
    if (apart < MIN_DISTANCE) twins.push(`${pair} (${apart.toFixed(0)})`);
  }
}

check(
  'لا هويّتان توأمان في القائمة',
  twins.length === 0,
  twins.join('، ') || `أقربُ زوجٍ ${closest.pair} بمسافة ${closest.value.toFixed(0)} · العتبة ${MIN_DISTANCE}`,
);

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

/*
 * ثلاثة أسماء متقاعدة، ولكلٍّ خلفٌ مقصود:
 *   adana_classic ─┬─▶ b12_red        (القيمُ التي كانت تحملها قيمُ B12)
 *   adana_b12     ─┘
 *   luxury_navy   ───▶ luxury_burgundy (والكحليّ الذهبيّ صار أضنة باسمها)
 */
const RETIRED = {
  adana_classic: 'b12_red',
  adana_b12: 'b12_red',
  luxury_navy: 'luxury_burgundy',
};

const misrouted = Object.entries(RETIRED)
  .filter(([old_, heir]) => resolveBrandKit(old_) !== BRAND_KITS[heir])
  .map(([old_, heir]) => `${old_} كان يجب أن يُحلّ إلى ${heir}`);

check(
  'كل اسم متقاعد يُحلّ إلى خلفه لا إلى الافتراضيّة',
  misrouted.length === 0,
  misrouted.join('، ') || `${Object.keys(RETIRED).length} أسماء موجَّهة · مطعمٌ أُنشئ باسمٍ قديم يبقى يحمله في صفّه`,
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
