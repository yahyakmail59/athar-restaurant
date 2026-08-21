/**
 * اختبار الإيصال.
 *
 * بناء الـSVG مفصول عن التحويل إلى PNG، فيمكن التحقق من المحتوى والترتيب
 * بلا WASM. التحويل نفسه يُختبر مرة واحدة في النهاية لإثبات أن العربية
 * تخرج موصولة، وهو ما عجز عنه المشروع الأصلي بلا مكتبتَي تشكيل.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildReceiptSvg } from '../receipt.js';

const order = {
  code: 'ADN-A7K2',
  restaurant_name: 'مطعم أضنة',
  restaurant_tagline: 'الطعم حكاية',
  customer_name: 'يوسف الشوا',
  phone: '0599123456',
  table_number: '',
  address: 'غزة — شارع الوحدة',
  notes: 'بدون بصل من فضلك',
  total_minor: 9500,
  currency: '₪',
  has_unpriced_lines: 1,
  language: 'ar',
};

const lines = [
  {
    name_ar: 'شاورما لحم', name_en: 'Beef Shawarma', variant_name_ar: 'وسط',
    quantity: 2, unit_price_minor: 2500, is_priced: 1, price_note: '',
    addons_json: JSON.stringify([{ name_ar: 'جبنة إضافية' }, { name_ar: 'صلصة حارة' }]),
  },
  {
    name_ar: 'بطاطا مقلية', name_en: 'Fries', variant_name_ar: '',
    quantity: 1, unit_price_minor: 1500, is_priced: 1, price_note: '', addons_json: '[]',
  },
  {
    name_ar: 'طبق اليوم', name_en: 'Daily Special', variant_name_ar: '',
    quantity: 1, unit_price_minor: 0, is_priced: 0, price_note: 'حسب الطلب', addons_json: '[]',
  },
];

const svg = buildReceiptSvg(order, lines, { accent: '#E30613' });

// المحتوى: كل ما يحتاجه السائق موجود.
for (const needle of ['مطعم أضنة', 'ADN-A7K2', 'شاورما لحم', 'وسط', 'جبنة إضافية',
  'يوسف الشوا', '0599123456', 'بدون بصل', 'الإجمالي', '95.00 ₪']) {
  assert.ok(svg.includes(needle), `الإيصال يفتقد: ${needle}`);
}

// السطر بلا سعر يعرض نصه لا صفرًا: صفر يوحي بأنه مجاني.
assert.ok(svg.includes('حسب الطلب'), 'السطر غير المسعّر يجب أن يعرض نصه');
assert.ok(!svg.includes('>0.00 ₪<'), 'السطر غير المسعّر يجب ألا يظهر بصفر');
assert.ok(svg.includes('يشمل أصنافًا بسعر يُحدَّد'), 'وجود سطر غير مسعّر يجب أن يُذكر تحت الإجمالي');

// الاتجاه: عربي يعني rtl في كل نص.
assert.ok(svg.includes('direction="rtl"'), 'النص العربي يجب أن يكون rtl');

// الحقن: اسم مطعم فيه وسوم لا يكسر الـSVG.
const hostile = buildReceiptSvg(
  { ...order, restaurant_name: '<script>alert(1)</script>', notes: 'a & b' },
  lines, {},
);
assert.ok(!hostile.includes('<script>'), 'يجب ترميز الوسوم لا تمريرها');
assert.ok(hostile.includes('&amp;'), 'يجب ترميز &');

// الإنجليزية تقلب الاتجاه والمحاذاة.
const english = buildReceiptSvg({ ...order, language: 'en' }, lines, {});
assert.ok(english.includes('direction="ltr"'), 'النص الإنجليزي يجب أن يكون ltr');
assert.ok(english.includes('Beef Shawarma'), 'الإنجليزية تعرض الاسم الإنجليزي');
assert.ok(english.includes('Total'), 'الإنجليزية تعرض Total');

// نص طويل يُقصّ فلا يخرج خارج البطاقة.
const long = buildReceiptSvg(order, [{
  ...lines[0], name_ar: 'ط'.repeat(120), addons_json: '[]',
}], {});
assert.ok(long.includes('…'), 'النص الطويل يجب أن يُقصّ');

// إضافات تالفة لا تُسقط الإيصال.
assert.doesNotThrow(() => buildReceiptSvg(order, [{ ...lines[0], addons_json: 'not json' }], {}));

// التداخل: كل سطر يجب أن ينزل تحت سابقه. الصورة الأولى بدت سليمة نصيًّا
// بينما الإضافات كانت ترسم فوق الصنف التالي، فلا يكفي التحقق من وجود النص.
function textRows(markup) {
  return [...markup.matchAll(/<text[^>]*y="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]));
}
const ys = textRows(svg);
assert.ok(ys.length >= 10, 'عدد السطور أقل من المتوقع');
for (let i = 1; i < ys.length; i += 1) {
  assert.ok(ys[i] >= ys[i - 1], `سطر يرتفع فوق سابقه عند ${i}: ${ys[i - 1]} ثم ${ys[i]}`);
}

// الارتفاع يتبع المحتوى: طلب بسطر واحد أقصر من طلب بثلاثة.
const short = buildReceiptSvg(order, [lines[1]], {});
const tall = buildReceiptSvg(order, [...lines, ...lines], {});
const heightOf = (markup) => Number(markup.match(/height="(\d+(?:\.\d+)?)"/)[1]);
assert.ok(heightOf(short) < heightOf(svg), 'إيصال أقصر يجب أن يكون أقل ارتفاعًا');
assert.ok(heightOf(tall) > heightOf(svg), 'إيصال أطول يجب أن يكون أعلى');

// آخر سطر يجب أن يبقى داخل البطاقة لا تحت حافتها.
assert.ok(Math.max(...ys) < heightOf(svg), 'سطر يخرج خارج ارتفاع الإيصال');

// طلب بلا بيانات زبون لا يترك فراغًا ولا يتداخل.
const bare = buildReceiptSvg(
  { ...order, customer_name: '', phone: '', address: '', notes: '', has_unpriced_lines: 0 },
  [lines[1]], {},
);
const bareYs = textRows(bare);
for (let i = 1; i < bareYs.length; i += 1) {
  assert.ok(bareYs[i] >= bareYs[i - 1], 'تداخل في إيصال بلا بيانات زبون');
}

console.log('receipt-svg-ok');

// التحويل الفعلي: يُشغَّل عند توفر resvg محليًا، ويُتخطى في CI بلا تثبيت.
if (process.env.RECEIPT_RENDER === '1') {
  const { initWasm, Resvg } = await import('@resvg/resvg-wasm');
  const wasmPath = fileURLToPath(new URL('../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
  await initWasm(readFileSync(wasmPath));
  const fontDir = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: [
        readFileSync(`${fontDir}IBMPlexSansArabic-Regular.ttf`),
        readFileSync(`${fontDir}IBMPlexSansArabic-SemiBold.ttf`),
      ],
      defaultFontFamily: 'IBM Plex Sans Arabic',
      loadSystemFonts: false,
    },
    fitTo: { mode: 'width', value: 720 },
  });
  const png = resvg.render().asPng();
  assert.ok(png.length > 5000, 'PNG أصغر من المتوقع');
  assert.equal(png[0], 0x89, 'توقيع PNG غير صحيح');
  writeFileSync(fileURLToPath(new URL('./receipt-sample.png', import.meta.url)), png);
  console.log('receipt-png-ok', png.length, 'bytes');
}
