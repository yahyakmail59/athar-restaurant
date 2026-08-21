/**
 * صور المطعم على R2.
 *
 * الضغط يحدث في المتصفح قبل الرفع، لا على الخادم. السبب اقتصادي: إعادة
 * الترميز على Cloudflare إما خدمة مدفوعة أو مُرمِّز WASM ثقيل داخل الـWorker،
 * بينما `canvas.toBlob` في المتصفح مجاني تمامًا ويكفي تمامًا. صورة هاتف
 * بـ4MB تصل بنحو 150KB.
 *
 * لكن الضغط في المتصفح **ليس تحققًا**. المتصفح يمكن تجاوزه، فالخادم يفحص
 * البايتات الأولى بنفسه: ملف يُخزَّن تحت نطاقنا ويُخدَم منه يجب أن يكون صورة
 * فعلًا لا شيئًا يحمل امتداد صورة.
 */

import { HttpError, UPLOAD_MAX_BYTES, json, readBoundedBody, str } from './lib.js';
import { canWriteSection } from './access.js';

/**
 * التوقيع الفعلي للملف من بايتاته الأولى.
 *
 * نوع المحتوى المرسل في الترويسة يكتبه الرافع، فلا يُصدَّق. النوع الذي نخدم
 * به الملف لاحقًا مشتق من هذا الفحص لا من الطلب.
 */
function sniffImage(bytes) {
  if (bytes.length < 12) return null;
  const [a, b, c, d] = bytes;
  if (a === 0xFF && b === 0xD8 && c === 0xFF) return { ext: 'jpg', type: 'image/jpeg' };
  if (a === 0x89 && b === 0x50 && c === 0x4E && d === 0x47) return { ext: 'png', type: 'image/png' };
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  const format = String.fromCharCode(...bytes.slice(8, 12));
  if (tag === 'RIFF' && format === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  if (a === 0x47 && b === 0x49 && c === 0x46) return { ext: 'gif', type: 'image/gif' };
  return null;
}

export async function uploadImage(request, env, session) {
  if (!canWriteSection(session.role, 'settings')) {
    throw new HttpError(403, 'FORBIDDEN', 'رفع الصور للمالك والمدير.');
  }
  if (!env.ASSETS_BUCKET) throw new HttpError(500, 'STORAGE_UNAVAILABLE', 'التخزين غير مهيّأ.');

  const bytes = await readBoundedBody(request, UPLOAD_MAX_BYTES);
  if (!bytes.byteLength) throw new HttpError(422, 'EMPTY_FILE', 'لم يصل ملف.');

  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(422, 'NOT_AN_IMAGE', 'الملف ليس صورة مدعومة (JPEG/PNG/WebP/GIF).');

  const key = `r/${session.restaurant_id}/${crypto.randomUUID()}.${kind.ext}`;
  await env.ASSETS_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { restaurant_id: session.restaurant_id, uploaded_by: session.user_id },
  });

  return json({ ok: true, url: `/img/${key}`, bytes: bytes.byteLength, type: kind.type }, 201);
}

/**
 * حذف صورة.
 *
 * المفتاح يجب أن يبدأ ببادئة هذا المطعم. بدون الشرط يمسح مطعمٌ صور جاره
 * بإرسال مفتاح خمّنه.
 */
export async function deleteImage(env, session, key) {
  const clean = str(key, 300);
  const prefix = `r/${session.restaurant_id}/`;
  if (!clean.startsWith(prefix) || clean.includes('..')) {
    throw new HttpError(403, 'FORBIDDEN', 'هذه الصورة ليست لهذا المطعم.');
  }
  if (!env.ASSETS_BUCKET) throw new HttpError(500, 'STORAGE_UNAVAILABLE', 'التخزين غير مهيّأ.');
  await env.ASSETS_BUCKET.delete(clean);
  return json({ ok: true });
}

/**
 * خدمة الصور.
 *
 * المفتاح يحوي UUID لا يتكرر، فالمحتوى ثابت ويُخبَّأ سنة بلا خوف. الترويسة
 * `nosniff` ضرورية: بلا فحص التوقيع كان المتصفح قد يفسّر ملفًا مرفوعًا على
 * أنه HTML ويشغّله على نطاقنا.
 */
export async function serveImage(env, pathname) {
  if (!env.ASSETS_BUCKET) return new Response('Not found', { status: 404 });
  const key = decodeURIComponent(pathname.replace(/^\/img\//, ''));
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  const object = await env.ASSETS_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(object.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ETag: object.httpEtag,
    },
  });
}
