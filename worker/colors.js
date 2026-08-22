/**
 * تحويلات الألوان — منقولة حرفيًا عن خصائص `RestaurantSettings` في أضنة.
 *
 * لماذا هنا لا في `render.js`: تُستدعى من الموقع العام (`--brand-ink`) ومن
 * صفحة الطلب المستقلة على السواء، فوضعها في وحدة مشتركة يمنع نسخة ثانية
 * تنحرف عن الأولى.
 */

const HEX3_OR_6 = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseHex(value, fallback) {
  const raw = String(value || '').trim();
  if (!HEX3_OR_6.test(raw)) return parseHex(fallback, '#000000');
  let hex = raw.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

/** لون كثلاثي RGB نصّي، يُستعمل في `rgba(var(--x-rgb), a)`. */
export function rgbTriplet(value, fallback) {
  const [r, g, b] = parseHex(value, fallback);
  return `${r}, ${g}, ${b}`;
}

/**
 * لون حبر مقروء (أبيض أو أسود تقريبًا) يُوضع فوق `value`، باستعمال نسبة
 * تباين WCAG. هذا ما يبقي الأزرار مقروءة أيًّا كان لون المطعم — ذهبي أضنة
 * (#D4AF37) فاتح فيحتاج نصًّا داكنًا، لا أبيض كما يفترض أي زر أحمر عادي.
 */
export function inkFor(value, fallback) {
  const [r, g, b] = parseHex(value, fallback);
  const channel = (c) => {
    const normalized = c / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? '#111111' : '#ffffff';
}

/** يتحقق من أن القيمة لون hex صالح، أو يرفض. لا يمرّ إلى الخادم لون فيه `;` أو `}`. */
export const isValidHex = (value) => HEX3_OR_6.test(String(value || '').trim());
