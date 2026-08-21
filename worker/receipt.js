/**
 * إيصال الطلب صورةً، مرسوم على الخادم بالكامل.
 *
 * لماذا على الخادم: الصورة تستحق الإرسال فقط لأن أسعارها من قاعدة البيانات.
 * صورة تُرسم في المتصفح تحمل السعر الذي تحمله الصفحة، وهو ما يستطيع الزبون
 * تعديله قبل أن يرسلها.
 *
 * لماذا SVG ثم PNG: مشروع Django كان يرسم بـPillow، وبناؤه بلا Raqm لا يشكّل
 * العربية، فاضطر إلى `arabic_reshaper` و`python-bidi` لإعادة تشكيل النص يدويًا
 * قبل الرسم. هنا `resvg` يستعمل `rustybuzz` للتشكيل و`unicode-bidi` للترتيب
 * داخليًا، فنكتب النص العربي كما هو ويخرج موصولًا ومرتبًا. لا حاجة إلى أي
 * مكتبة تشكيل.
 *
 * التخطيط تراكمي: مؤشر `y` واحد ينزل مع كل سطر يُرسم. المحاولة الأولى بنت
 * السطور بإحداثيات ثابتة ثم أزاحتها نصيًّا، فتداخلت السطور فور تغيّر عدد
 * الأسطر. هنا لا يوجد ما يُزاح — كل سطر يعرف موضعه لأن ما قبله رسم نفسه.
 *
 * التصميم بطاقة فاتحة: يُقرأ في الشمس وعلى الورق، وهناك يقرؤه السائق فعلًا.
 */

const WIDTH = 720;
const PADDING = 40;
const FONT_FAMILY = 'IBM Plex Sans Arabic';

let wasmReady = null;

/**
 * يُهيَّأ مرة واحدة لكل عزلة، لا مرة لكل طلب.
 *
 * الاستيراد كسول عمدًا: `index_bg.wasm` صيغة يفهمها Workers وحدها، واستيرادها
 * في أعلى الملف يمنع تشغيل اختبارات بناء الـSVG على Node.
 */
async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const [{ initWasm }, { default: wasmModule }] = await Promise.all([
        import('@resvg/resvg-wasm'),
        import('@resvg/resvg-wasm/index_bg.wasm'),
      ]);
      await initWasm(wasmModule);
    })();
  }
  await wasmReady;
}

let fontCache = null;

/**
 * الخطوط من R2 لا من حزمة الـWorker: ملفان بنحو 480KB يقاربان حد الحجم،
 * وتحميلهما مرة ثم الاحتفاظ بهما في العزلة أرخص من حملهما في كل نشر.
 */
async function loadFonts(env) {
  if (fontCache) return fontCache;
  const names = ['IBMPlexSansArabic-Regular.ttf', 'IBMPlexSansArabic-SemiBold.ttf'];
  const buffers = [];
  for (const name of names) {
    const object = await env.ASSETS_BUCKET?.get(`fonts/${name}`);
    if (object) buffers.push(new Uint8Array(await object.arrayBuffer()));
  }
  if (!buffers.length) throw new Error('RECEIPT_FONTS_MISSING');
  fontCache = buffers;
  return fontCache;
}

const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const money = (minor, currency) => `${(minor / 100).toFixed(2)} ${currency}`;

/**
 * قصّ يحمي التخطيط: سطر أطول من العرض يخرج خارج البطاقة بلا أثر مرئي
 * لأن SVG لا يلفّ النص تلقائيًا.
 */
function clip(text, maxChars) {
  const value = String(text ?? '').trim();
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

/**
 * يبني SVG الإيصال.
 *
 * مفصول عن التحويل ليكون قابلًا للاختبار وحده: التحقق من نص السطور
 * وترتيبها لا يحتاج تشغيل WASM.
 */
export function buildReceiptSvg(order, lines, options = {}) {
  const currency = order.currency || '₪';
  const rtl = (order.language || 'ar') !== 'en';
  const accent = options.accent || '#E30613';

  // في RTL النص يبدأ من اليمين والسعر يقابله على اليسار، والعكس في LTR.
  const dir = rtl ? 'rtl' : 'ltr';
  const startX = rtl ? WIDTH - PADDING : PADDING;
  const startAnchor = rtl ? 'end' : 'start';
  const endX = rtl ? PADDING : WIDTH - PADDING;
  const endAnchor = rtl ? 'start' : 'end';

  const parts = [];
  let y = 0;

  const text = (value, { x, anchor, size, fill, weight = 400, direction = dir }) =>
    parts.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" direction="${direction}"`
      + ` font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}"`
      + ` fill="${fill}">${escapeXml(value)}</text>`);

  const rule = () => parts.push(
    `<line x1="${PADDING}" y1="${y}" x2="${WIDTH - PADDING}" y2="${y}" stroke="#E4E4E4" stroke-width="1"/>`);

  // ---------- الترويسة ----------
  y = 58;
  text(clip(order.restaurant_name, 30), { x: startX, anchor: startAnchor, size: 28, fill: '#111111', weight: 600 });
  text(order.code, { x: endX, anchor: endAnchor, size: 22, fill: accent, weight: 600, direction: 'ltr' });

  if (order.restaurant_tagline) {
    y += 26;
    text(clip(order.restaurant_tagline, 44), { x: startX, anchor: startAnchor, size: 15, fill: '#6B6B6B' });
  }

  // ---------- بيانات الزبون ----------
  const meta = [
    order.customer_name && `${rtl ? 'الاسم' : 'Name'}: ${clip(order.customer_name, 30)}`,
    order.phone && `${rtl ? 'الهاتف' : 'Phone'}: ${order.phone}`,
    order.table_number && `${rtl ? 'الطاولة' : 'Table'}: ${order.table_number}`,
    order.address && `${rtl ? 'العنوان' : 'Address'}: ${clip(order.address, 40)}`,
  ].filter(Boolean);

  for (const entry of meta) {
    y += 24;
    text(entry, { x: startX, anchor: startAnchor, size: 16, fill: '#6B6B6B' });
  }

  y += 26;
  rule();

  // ---------- السطور ----------
  for (const line of lines) {
    y += 34;
    const name = clip(rtl ? (line.name_ar || line.name_en) : (line.name_en || line.name_ar), 34);
    const label = line.variant_name_ar ? `${name} — ${line.variant_name_ar}` : name;
    text(label, { x: startX, anchor: startAnchor, size: 21, fill: '#1A1A1A' });
    text(
      line.is_priced ? money(line.unit_price_minor * line.quantity, currency) : (line.price_note || '—'),
      { x: endX, anchor: endAnchor, size: 21, fill: '#1A1A1A', direction: line.is_priced ? 'ltr' : dir },
    );

    y += 24;
    const unit = line.is_priced ? money(line.unit_price_minor, currency) : (line.price_note || '');
    text(`${line.quantity} × ${unit}`, { x: startX, anchor: startAnchor, size: 16, fill: '#6B6B6B' });

    let addons = [];
    try {
      addons = JSON.parse(line.addons_json || '[]');
    } catch { /* سطر بإضافات تالفة يُرسم بلا إضافات بدل أن يُسقط الإيصال */ }
    for (const addon of addons) {
      y += 22;
      // العلامة داخل النص لا خارجه: وضعها خارجه يقذفها إلى الطرف المقابل في RTL.
      const mark = rtl ? '‏+ ' : '+ ';
      text(`${mark}${clip(addon.name_ar || addon.name_en || addon.name, 30)}`,
        { x: startX, anchor: startAnchor, size: 16, fill: '#6B6B6B' });
    }
  }

  // ---------- الإجمالي ----------
  y += 30;
  rule();
  y += 34;
  text(rtl ? 'الإجمالي' : 'Total', { x: startX, anchor: startAnchor, size: 24, fill: '#111111', weight: 600 });
  text(money(order.total_minor, currency),
    { x: endX, anchor: endAnchor, size: 24, fill: accent, weight: 600, direction: 'ltr' });

  if (order.has_unpriced_lines) {
    y += 26;
    text(rtl ? 'يشمل أصنافًا بسعر يُحدَّد عند التحضير' : 'Includes items priced on preparation',
      { x: startX, anchor: startAnchor, size: 15, fill: '#B54708' });
  }

  if (order.notes) {
    y += 28;
    text(`${rtl ? 'ملاحظة' : 'Note'}: ${clip(order.notes, 46)}`,
      { x: startX, anchor: startAnchor, size: 16, fill: '#6B6B6B' });
  }

  const height = y + PADDING;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}"`
    + ` viewBox="0 0 ${WIDTH} ${height}">`
    + `<rect width="${WIDTH}" height="${height}" fill="#FFFFFF"/>`
    + `<rect x="0" y="0" width="${WIDTH}" height="8" fill="${escapeXml(accent)}"/>`
    + parts.join('')
    + '</svg>';
}

/** يحوّل SVG إلى PNG. يتطلب WASM والخطوط، فيُستدعى من مسار الطلب وحده. */
export async function renderReceiptPng(env, order, lines, options = {}) {
  await ensureWasm();
  const { Resvg } = await import('@resvg/resvg-wasm');
  const fontBuffers = await loadFonts(env);
  const svg = buildReceiptSvg(order, lines, options);
  const resvg = new Resvg(svg, {
    font: { fontBuffers, defaultFontFamily: FONT_FAMILY, loadSystemFonts: false },
    fitTo: { mode: 'width', value: WIDTH },
  });
  return resvg.render().asPng();
}
