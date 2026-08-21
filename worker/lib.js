/**
 * أدوات مشتركة: تعمية، جلسات، أخطاء، قراءة أجسام محدودة.
 *
 * مفصولة عن `worker.js` لأن محرك المطاعم أكبر من سابقيه: الموقع العام
 * والمنيو والطلبات والكاشير في ملف واحد يصير غير قابل للقراءة. الصيدلية
 * والمدرسة احتملتا ملفًا واحدًا لأنهما نظاما إدارة بلا واجهة عامة.
 */

export const PBKDF2_ITER = 100000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_FAILS = 5;
export const LOCK_STEPS_MS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3];
export const ADAPTER_MAX_BODY_BYTES = 64 * 1024;
export const API_MAX_BODY_BYTES = 512 * 1024;
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const ADAPTER_CLOCK_SKEW_SECONDS = 5 * 60;

export const enc = (s) => new TextEncoder().encode(s);
export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function sha256b64(text) {
  return b64(await crypto.subtle.digest('SHA-256', enc(text)));
}

export async function hmacBytes(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(text)));
}

export const hmacHex = async (secret, text) => bytesToHex(await hmacBytes(secret, text));

export async function derivePassword(password, saltB64, iterations = PBKDF2_ITER) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256,
  ));
}

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
export const newToken = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

/** مقارنة ثابتة الزمن: الخروج المبكر يسرّب طول التطابق. */
export function safeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extra } });

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const str = (value, max = 200) => (value == null ? '' : String(value).slice(0, max));

export const num = (value) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0);

export const bool = (value) => (value ? 1 : 0);

export async function readBoundedBody(request, limit) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > limit) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel('body too large');
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(request, limit = API_MAX_BODY_BYTES) {
  const bytes = await readBoundedBody(request, limit);
  if (!bytes.byteLength) return {};
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request JSON is invalid.');
  }
}

/* ==================== محاولات الدخول ==================== */

export async function checkLock(db, key) {
  const row = await db.prepare('SELECT fails, locked_until FROM login_attempts WHERE key = ?').bind(key).first();
  if (!row) return 0;
  const remaining = Number(row.locked_until || 0) - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function noteFail(db, key) {
  const row = await db.prepare('SELECT fails FROM login_attempts WHERE key = ?').bind(key).first();
  const fails = Number(row?.fails || 0) + 1;
  const step = Math.min(Math.max(fails - MAX_FAILS, 0), LOCK_STEPS_MS.length - 1);
  const lockedUntil = fails >= MAX_FAILS ? Date.now() + LOCK_STEPS_MS[step] : 0;
  await db.prepare(
    `INSERT INTO login_attempts (key, fails, locked_until) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`,
  ).bind(key, fails, lockedUntil).run();
}

export const clearFails = (db, key) =>
  db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();

/* ==================== تنسيق ==================== */

/** المبالغ أعداد صحيحة بأصغر وحدة. القسمة تحدث عند العرض وحده. */
export const money = (minor, currency) => `${(Number(minor || 0) / 100).toFixed(2)} ${currency}`;

/**
 * ترميز HTML.
 *
 * كل نص يمر من قاعدة البيانات إلى الصفحة يمر من هنا. اسم صنف فيه `<`
 * لا يجب أن يصير وسمًا، والموقع عام فالمُدخل قد يأتي من زبون لا من مطعم.
 */
export const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/**
 * لون صالح أو الافتراضي.
 *
 * الألوان تُحقن في CSS، ولون غير متحقَّق منه يخرج من قيمة الخاصية إلى
 * قاعدة جديدة. الحقن في CSS أهدأ من حقن HTML ولذلك أسهل في النسيان.
 */
export function safeColor(value, fallback) {
  const raw = String(value || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : fallback;
}

/** اسم خط صالح: حروف ومسافات وشرطات فقط، فلا يهرب من `font-family`. */
export function safeFont(value, fallback) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9 _-]{1,40}$/.test(raw) ? raw : fallback;
}

/** رمز طلب قصير يُقرأ على الهاتف. بلا أحرف تشتبه: 0/O و1/I. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function orderCode(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  return `${String(prefix || 'ORD').slice(0, 6).toUpperCase()}-${suffix}`;
}
