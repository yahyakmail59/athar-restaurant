/**
 * محوّل لوحة أثر — سبعة مسارات، هي نفسها في كل محرك.
 *
 * التوقيع HMAC على `{timestamp}\n{requestId}\n{METHOD}\n{pathname}\n{sha256(body)}`
 * وكل طلب بجسم يحمل `request_id` مطابقًا للترويسة. هذان الشرطان كسرا الربط
 * مرتين من قبل، فكلاهما مُختبَر آليًا من طرف اللوحة.
 */

import {
  ADAPTER_CLOCK_SKEW_SECONDS, ADAPTER_MAX_BODY_BYTES, HttpError, PBKDF2_ITER,
  bytesToHex, derivePassword, enc, hmacBytes, hmacHex, json, newSalt,
  readBoundedBody, safeEqual, sha256Hex, str,
} from './lib.js';
import { demoSeedStatements, DEMO_SEED_VERSION, defaultContentStatements } from './seed.js';

export async function verifyAdapterRequest(request, env) {
  const secret = env.ATHAR_ADAPTER_SECRET;
  if (!secret) throw new HttpError(500, 'ADAPTER_NOT_CONFIGURED', 'Product adapter is not configured.');

  const timestamp = request.headers.get('X-Athar-Timestamp') || '';
  const requestId = request.headers.get('X-Athar-Request-Id') || '';
  const signature = (request.headers.get('X-Athar-Signature') || '').toLowerCase();
  if (!/^\d{10}$/.test(timestamp) || !/^[0-9a-f-]{36}$/.test(requestId) || !/^[0-9a-f]{64}$/.test(signature)) {
    throw new HttpError(401, 'ADAPTER_UNAUTHORIZED', 'Adapter authentication failed.');
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > ADAPTER_CLOCK_SKEW_SECONDS) {
    throw new HttpError(401, 'ADAPTER_TIMESTAMP_EXPIRED', 'Adapter request timestamp is outside the accepted window.');
  }

  const bodyBytes = await readBoundedBody(request, ADAPTER_MAX_BODY_BYTES);
  const requestHash = await sha256Hex(bodyBytes);
  const pathname = new URL(request.url).pathname;
  const canonical = `${timestamp}\n${requestId}\n${request.method.toUpperCase()}\n${pathname}\n${requestHash}`;
  if (!safeEqual(await hmacHex(secret, canonical), signature)) {
    throw new HttpError(401, 'ADAPTER_UNAUTHORIZED', 'Adapter authentication failed.');
  }

  let body = {};
  if (bodyBytes.byteLength) {
    try {
      body = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
      throw new HttpError(400, 'INVALID_JSON', 'Adapter request JSON is invalid.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'INVALID_JSON', 'Adapter request JSON must be an object.');
    }
    if (body.request_id !== requestId) {
      throw new HttpError(400, 'REQUEST_ID_MISMATCH', 'Body and header request IDs must match.');
    }
  }
  return { requestId, requestHash, body };
}

function adapterRequired(value, code, max = 160) {
  const normalized = str(value, max + 1).trim();
  if (!normalized || normalized.length > max) {
    throw new HttpError(422, code, 'A required adapter field is invalid.');
  }
  return normalized;
}

async function beginAdapterRequest(db, requestId, action, tenantId, requestHash) {
  const existing = await db.prepare(
    'SELECT request_hash, status, response_json FROM adapter_requests WHERE request_id = ?',
  ).bind(requestId).first();
  if (existing) {
    if (!safeEqual(String(existing.request_hash), requestHash)) {
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This request ID was already used for different data.');
    }
    if (existing.status === 'succeeded') {
      return { replay: true, result: JSON.parse(existing.response_json || '{}') };
    }
    if (existing.status === 'pending') {
      throw new HttpError(409, 'REQUEST_IN_PROGRESS', 'This adapter request is already in progress.');
    }
    await db.prepare(
      "UPDATE adapter_requests SET status = 'pending', error_code = '', completed_at = NULL WHERE request_id = ?",
    ).bind(requestId).run();
    return { replay: false };
  }
  const claimed = await db.prepare(
    `INSERT OR IGNORE INTO adapter_requests
     (request_id, action, tenant_id, request_hash, status, response_json, error_code, created_at)
     VALUES (?, ?, ?, ?, 'pending', '{}', '', ?)`,
  ).bind(requestId, action, tenantId, requestHash, Date.now()).run();
  if (Number(claimed.meta?.changes || 0) === 0) {
    return beginAdapterRequest(db, requestId, action, tenantId, requestHash);
  }
  return { replay: false };
}

async function markAdapterFailed(db, requestId, code) {
  await db.prepare(
    "UPDATE adapter_requests SET status = 'failed', error_code = ?, completed_at = ? WHERE request_id = ?",
  ).bind(code, Date.now(), requestId).run();
}

const succeed = (db, requestId, result, now) => db.prepare(
  `UPDATE adapter_requests SET status = 'succeeded', response_json = ?, error_code = '', completed_at = ?
   WHERE request_id = ?`,
).bind(JSON.stringify(result), now, requestId);

async function externalRestaurantId(slug, tenantId) {
  const suffix = (await sha256Hex(enc(tenantId))).slice(0, 8);
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 15) || 'resto';
  return `ATH_${safeSlug}_${suffix}`.toUpperCase();
}

/**
 * الـslug العام: يظهر في رابط المطعم، وفريد على مستوى المحرك كله.
 *
 * مطعمان بنفس الاسم التجاري واردان، ولا يجوز أن يسرق أحدهما رابط الآخر،
 * فنلحق بصمة المستأجر عند التصادم بدل رفض الإنشاء.
 */
async function uniquePublicSlug(db, slug, tenantId) {
  const base = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40) || 'restaurant';
  const taken = await db.prepare('SELECT restaurant_id FROM restaurants WHERE slug = ?').bind(base).first();
  if (!taken) return base;
  const suffix = (await sha256Hex(enc(tenantId))).slice(0, 5);
  return `${base}-${suffix}`;
}

/**
 * كلمة مرور المالك الأولى، مشتقة من السر ومعرّف الطلب. إعادة الطلب نفسه
 * تعيد الكلمة نفسها، فلا يُقفل المطعم على صاحبه عند إعادة محاولة.
 */
async function ownerPassword(secret, requestId, tenantId) {
  const bytes = await hmacBytes(secret, `credential\n${requestId}\n${tenantId}`);
  return bytesToHex(bytes).slice(0, 12);
}

function publicSiteUrl(env, slug) {
  const base = str(env.PUBLIC_APP_URL, 300).trim();
  if (!base || !slug) return '';
  try {
    return new URL(`r/${slug}/`, base).toString();
  } catch {
    return '';
  }
}

/** الباقة من اللوحة قد تحمل اسمًا تجاريًا؛ المهم هل تشمل التشغيل أم لا. */
export const planCodeOf = (raw) => (str(raw, 40).toLowerCase().includes('full') ? 'full' : 'menu');

/**
 * شكل بيانات الدخول الموحّد بين المحركات. اللوحة تقرأ
 * `login_id/username/secret` ولا تحتاج أن تعرف تسمية كل منتج لسرّه.
 */
function credentialPayload(restaurantId, password, username = 'owner') {
  return {
    login_id: restaurantId,
    username,
    secret: password,
    secret_label: 'كلمة مرور المالك',
    restaurant_id: restaurantId,
    owner_username: username,
    owner_password: password,
  };
}

async function provision(env, signed) {
  const db = env.DB;
  const body = signed.body;
  const tenantId = adapterRequired(body.tenant_id, 'INVALID_TENANT_ID', 80);
  const slug = adapterRequired(body.slug, 'INVALID_SLUG', 40);
  const displayName = adapterRequired(body.display_name, 'INVALID_DISPLAY_NAME', 160);
  const environment = body.environment === 'demo' ? 'demo'
    : body.environment === 'production' ? 'production' : '';
  if (!environment) throw new HttpError(422, 'INVALID_ENVIRONMENT', 'Environment must be demo or production.');
  const planCode = planCodeOf(adapterRequired(body.plan_code, 'INVALID_PLAN_CODE', 80));
  const config = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : {};
  const ownerUsername = str(body.admin_username, 60).trim().toLowerCase() || 'owner';
  if (!/^[a-z0-9._-]{3,40}$/.test(ownerUsername)) {
    throw new HttpError(422, 'INVALID_ADMIN_USERNAME',
      'اسم المستخدم: حروف إنجليزية وأرقام ونقطة وشرطة، من 3 إلى 40.');
  }

  const started = await beginAdapterRequest(db, signed.requestId, 'create', tenantId, signed.requestHash);
  const password = await ownerPassword(env.ATHAR_ADAPTER_SECRET, signed.requestId, tenantId);
  if (started.replay) {
    return json({
      ...started.result,
      credentials: credentialPayload(started.result.external_tenant_id, password,
        started.result.admin_username || ownerUsername),
      replayed: true,
    });
  }

  try {
    const mapped = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
      .bind(tenantId).first();
    if (mapped) throw new HttpError(409, 'TENANT_ALREADY_EXISTS', 'This Athar tenant is already mapped to a restaurant.');

    const restaurantId = await externalRestaurantId(slug, tenantId);
    const publicSlug = await uniquePublicSlug(db, slug, tenantId);
    const salt = newSalt();
    const hash = await derivePassword(password, salt);
    const now = Date.now();
    const seedVersion = environment === 'demo' ? DEMO_SEED_VERSION : '';

    const result = {
      ok: true,
      request_id: signed.requestId,
      tenant_id: tenantId,
      external_tenant_id: restaurantId,
      status: 'active',
      environment,
      seed_version: seedVersion,
      public_url: publicSiteUrl(env, publicSlug),
      admin_username: ownerUsername,
      slug: publicSlug,
    };

    const statements = [
      db.prepare(
        `INSERT INTO restaurants
         (restaurant_id, control_tenant_id, slug, name, environment, plan_code, trial_expires_at,
          lifecycle_status, is_active, seed_version, provisioned_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)`,
      ).bind(
        restaurantId, tenantId, publicSlug, displayName, environment, planCode,
        body.trial_expires_at || null, seedVersion, now, now, now,
      ),
      db.prepare(
        `INSERT INTO users
         (id, restaurant_id, username, display_name, role, password_hash, password_salt,
          password_iterations, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', ?, ?, ?, 1, ?, ?)`,
      ).bind(`owner_${restaurantId}`, restaurantId, ownerUsername, `مالك ${displayName}`,
        hash, salt, PBKDF2_ITER, now, now),
    ];

    // النسخة النظيفة تصل بموقع كامل النصوص لا بصفحة فارغة: مطعم يفتح لوحته
    // فيجد حقولًا خاوية لا يعرف ماذا يكتب فيها لن يكمل الإعداد.
    statements.push(...defaultContentStatements(db, restaurantId, {
      displayName, planCode, config, now,
    }));
    if (environment === 'demo') statements.push(...demoSeedStatements(db, restaurantId, now, displayName));
    statements.push(succeed(db, signed.requestId, result, now));

    await db.batch(statements);
    console.log(JSON.stringify({
      event: 'adapter.provision', request_id: signed.requestId, tenant_id: tenantId, status: 'succeeded',
    }));
    return json({ ...result, credentials: credentialPayload(restaurantId, password, ownerUsername) }, 201);
  } catch (error) {
    await markAdapterFailed(db, signed.requestId, error instanceof HttpError ? error.code : 'PROVISIONING_FAILED');
    throw error;
  }
}

async function changeStatus(env, signed, tenantIdFromPath) {
  const db = env.DB;
  const tenantId = adapterRequired(tenantIdFromPath, 'INVALID_TENANT_ID', 80);
  const action = str(signed.body.action, 40);
  if (!['suspend', 'resume', 'archive', 'restore'].includes(action)) {
    throw new HttpError(422, 'INVALID_ACTION', 'Lifecycle action is invalid.');
  }
  const started = await beginAdapterRequest(db, signed.requestId, action, tenantId, signed.requestHash);
  if (started.replay) return json({ ...started.result, replayed: true });

  try {
    const row = await db.prepare(
      'SELECT restaurant_id, lifecycle_status FROM restaurants WHERE control_tenant_id = ?',
    ).bind(tenantId).first();
    if (!row) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Product tenant was not found.');
    const current = String(row.lifecycle_status || 'active');
    if (current === 'archived' && action !== 'archive' && action !== 'restore') {
      throw new HttpError(409, 'TENANT_ARCHIVED', 'An archived tenant must be restored before other changes.');
    }
    if (action === 'restore' && current !== 'archived') {
      throw new HttpError(409, 'TENANT_NOT_ARCHIVED', 'Only an archived tenant can be restored.');
    }
    // الاستعادة تُخرج من الأرشيف وتترك المطعم موقوفًا؛ عودة الخدمة قرار منفصل.
    const next = action === 'resume' ? 'active'
      : action === 'suspend' || action === 'restore' ? 'suspended' : 'archived';
    const active = next === 'active' ? 1 : 0;
    const now = Date.now();
    const result = {
      ok: true, request_id: signed.requestId, tenant_id: tenantId,
      external_tenant_id: row.restaurant_id, status: next,
    };
    const statements = [
      db.prepare('UPDATE restaurants SET is_active = ?, lifecycle_status = ?, updated_at = ? WHERE control_tenant_id = ?')
        .bind(active, next, now, tenantId),
      succeed(db, signed.requestId, result, now),
    ];
    // الإيقاف يقطع الجلسات القائمة، وإلا بقي كاشير مفتوح يقبل طلبات بعد التوقف.
    if (!active) {
      statements.push(db.prepare('DELETE FROM sessions WHERE restaurant_id = ?').bind(row.restaurant_id));
    }
    await db.batch(statements);
    return json(result);
  } catch (error) {
    await markAdapterFailed(db, signed.requestId, error instanceof HttpError ? error.code : 'LIFECYCLE_FAILED');
    throw error;
  }
}

async function changePlan(env, signed, tenantIdFromPath) {
  const db = env.DB;
  const tenantId = adapterRequired(tenantIdFromPath, 'INVALID_TENANT_ID', 80);
  const planCode = planCodeOf(adapterRequired(signed.body.plan_code, 'INVALID_PLAN_CODE', 80));
  const started = await beginAdapterRequest(db, signed.requestId, 'change_plan', tenantId, signed.requestHash);
  if (started.replay) return json({ ...started.result, replayed: true });

  try {
    const row = await db.prepare('SELECT restaurant_id FROM restaurants WHERE control_tenant_id = ?')
      .bind(tenantId).first();
    if (!row) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Product tenant was not found.');
    const now = Date.now();
    const result = {
      ok: true, request_id: signed.requestId, tenant_id: tenantId,
      external_tenant_id: row.restaurant_id, plan_code: planCode,
    };
    // موضع واحد للباقة عمدًا. في محرك المدارس كانت الباقة مخزّنة مرتين،
    // فحدّثنا واحدة وبقيت الشاشات تقرأ الأخرى. هنا `restaurants.plan_code`
    // هو المصدر الوحيد، وكل مسار يقرأ منه، فلا يوجد نصف يمكن أن يتخلّف.
    // النزول من full إلى menu يمنع الوصول ولا يحذف طلبًا واحدًا؛ الترقية تعيده.
    await db.batch([
      db.prepare('UPDATE restaurants SET plan_code = ?, updated_at = ? WHERE control_tenant_id = ?')
        .bind(planCode, now, tenantId),
      succeed(db, signed.requestId, result, now),
    ]);
    return json(result);
  } catch (error) {
    await markAdapterFailed(db, signed.requestId, error instanceof HttpError ? error.code : 'PLAN_CHANGE_FAILED');
    throw error;
  }
}

/**
 * تحديث الهوية من لوحة أثر.
 *
 * الاسم هو ما بيع عليه الاشتراك، فلا يعدّله المطعم من إعداداته. أُخفي الحقل
 * هناك ومُنع على الخادم، فوجب أن يوجد طريق واحد لتغييره وإلا صار ثابتًا للأبد.
 */
async function updateProfile(env, signed, tenantIdFromPath) {
  const db = env.DB;
  const tenantId = adapterRequired(tenantIdFromPath, 'INVALID_TENANT_ID', 80);
  const started = await beginAdapterRequest(db, signed.requestId, 'update_profile', tenantId, signed.requestHash);
  if (started.replay) return json({ ...started.result, replayed: true });

  try {
    const row = await db.prepare(
      'SELECT restaurant_id, name FROM restaurants WHERE control_tenant_id = ?',
    ).bind(tenantId).first();
    if (!row) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Product tenant was not found.');

    const current = await db.prepare('SELECT name_en FROM settings WHERE restaurant_id = ?')
      .bind(row.restaurant_id).first();

    const nextName = signed.body.display_name === undefined
      ? String(row.name)
      : adapterRequired(signed.body.display_name, 'INVALID_DISPLAY_NAME', 160);
    // الاسم المختصر يخدم الاسم اللاتيني في الموقع ثنائي اللغة.
    const nextShort = signed.body.short_name === undefined
      ? String(current?.name_en || nextName)
      : (str(signed.body.short_name, 60).trim() || nextName);

    const now = Date.now();
    const result = {
      ok: true, request_id: signed.requestId, tenant_id: tenantId,
      external_tenant_id: row.restaurant_id, display_name: nextName, short_name: nextShort,
    };
    await db.batch([
      db.prepare('UPDATE restaurants SET name = ?, updated_at = ? WHERE control_tenant_id = ?')
        .bind(nextName, now, tenantId),
      db.prepare('UPDATE settings SET name_ar = ?, name_en = ?, updated_at = ? WHERE restaurant_id = ?')
        .bind(nextName, nextShort, now, row.restaurant_id),
      succeed(db, signed.requestId, result, now),
    ]);
    return json(result);
  } catch (error) {
    await markAdapterFailed(db, signed.requestId, error instanceof HttpError ? error.code : 'PROFILE_UPDATE_FAILED');
    throw error;
  }
}

async function resetOwnerCredential(env, signed, tenantIdFromPath) {
  const db = env.DB;
  const tenantId = adapterRequired(tenantIdFromPath, 'INVALID_TENANT_ID', 80);
  const started = await beginAdapterRequest(db, signed.requestId, 'reset_owner_credential', tenantId, signed.requestHash);
  const password = await ownerPassword(env.ATHAR_ADAPTER_SECRET, signed.requestId, tenantId);
  if (started.replay) {
    return json({
      ...started.result,
      credentials: credentialPayload(started.result.external_tenant_id, password,
        started.result.admin_username || 'owner'),
      replayed: true,
    });
  }
  try {
    const row = await db.prepare(
      'SELECT restaurant_id, lifecycle_status FROM restaurants WHERE control_tenant_id = ?',
    ).bind(tenantId).first();
    if (!row) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Product tenant was not found.');
    if (String(row.lifecycle_status) === 'archived') {
      throw new HttpError(409, 'TENANT_ARCHIVED', 'An archived tenant cannot receive a new password.');
    }
    const owner = await db.prepare(
      "SELECT id, username FROM users WHERE restaurant_id = ? AND role = 'owner' ORDER BY id LIMIT 1",
    ).bind(row.restaurant_id).first();
    if (!owner) throw new HttpError(404, 'OWNER_NOT_FOUND', 'This tenant has no owner account.');

    const salt = newSalt();
    const hash = await derivePassword(password, salt);
    const now = Date.now();
    const result = {
      ok: true, request_id: signed.requestId, tenant_id: tenantId,
      external_tenant_id: row.restaurant_id, status: 'password_reset',
      admin_username: owner.username,
    };
    await db.batch([
      db.prepare(
        `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?,
         is_active = 1, updated_at = ? WHERE id = ?`,
      ).bind(hash, salt, PBKDF2_ITER, now, owner.id),
      db.prepare('DELETE FROM sessions WHERE restaurant_id = ?').bind(row.restaurant_id),
      succeed(db, signed.requestId, result, now),
    ]);
    return json({ ...result, credentials: credentialPayload(row.restaurant_id, password, owner.username) });
  } catch (error) {
    await markAdapterFailed(db, signed.requestId, error instanceof HttpError ? error.code : 'PASSWORD_RESET_FAILED');
    throw error;
  }
}

/**
 * مانيفست الحذف: كل جدول يحمل `restaurant_id`.
 *
 * الاختبار في `tests/purge.test.mjs` يقارن هذه القائمة بأعمدة المخطط، فجدول
 * جديد يُنسى هنا يُسقط الاختبار بدل أن يترك بيانات مطعم محذوف في القاعدة.
 */
export const RESTAURANT_SCOPED_TABLES = [
  'sessions', 'users', 'settings', 'hero_stats', 'categories', 'menu_items',
  'menu_item_variants', 'menu_item_addons', 'offers', 'services', 'testimonials',
  'faqs', 'social_posts', 'reservations', 'orders', 'order_lines', 'restaurant_audit',
];

async function purge(env, signed, tenantIdFromPath) {
  const db = env.DB;
  const tenantId = adapterRequired(tenantIdFromPath, 'INVALID_TENANT_ID', 80);
  const started = await beginAdapterRequest(db, signed.requestId, 'purge', tenantId, signed.requestHash);
  if (started.replay) return json({ ...started.result, replayed: true });

  try {
    const row = await db.prepare(
      'SELECT restaurant_id, lifecycle_status FROM restaurants WHERE control_tenant_id = ?',
    ).bind(tenantId).first();
    if (!row) {
      // الحذف idempotent: غياب السجل يعني أن عملية سابقة أتمت المهمة.
      const done = {
        ok: true, request_id: signed.requestId, tenant_id: tenantId,
        external_tenant_id: '', status: 'deleted',
      };
      await succeed(db, signed.requestId, done, Date.now()).run();
      return json(done);
    }
    if (String(row.lifecycle_status) !== 'archived') {
      throw new HttpError(409, 'TENANT_NOT_ARCHIVED', 'A tenant must be archived before it is purged.');
    }
    const now = Date.now();
    const result = {
      ok: true, request_id: signed.requestId, tenant_id: tenantId,
      external_tenant_id: row.restaurant_id, status: 'deleted',
    };
    const statements = RESTAURANT_SCOPED_TABLES.map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE restaurant_id = ?`).bind(row.restaurant_id));
    statements.push(
      // مفاتيح محاولات الدخول تحمل المطعم كبادئة لا كعمود. لا LIKE هنا:
      // المعرّف يحتوي `_` وهو محرف بدل في LIKE، فكان سيطابق مطاعم أخرى.
      db.prepare('DELETE FROM login_attempts WHERE substr(key, 1, ?) = ?')
        .bind(row.restaurant_id.length + 1, `${row.restaurant_id}|`),
      db.prepare('DELETE FROM adapter_requests WHERE tenant_id = ? AND request_id <> ?')
        .bind(tenantId, signed.requestId),
      db.prepare('DELETE FROM restaurants WHERE control_tenant_id = ?').bind(tenantId),
      succeed(db, signed.requestId, result, now),
    );
    await db.batch(statements);
    // صور R2 تُحذف خارج الدفعة: تخزين منفصل لا يشارك المعاملة، وبقاء صورة
    // يتيمة أهون من فشل الحذف كله بسببها.
    await purgeImages(env, row.restaurant_id);
    console.log(JSON.stringify({
      event: 'adapter.purge', request_id: signed.requestId, tenant_id: tenantId, status: 'succeeded',
    }));
    return json(result);
  } catch (error) {
    await markAdapterFailed(db, signed.requestId, error instanceof HttpError ? error.code : 'PURGE_FAILED');
    throw error;
  }
}

async function purgeImages(env, restaurantId) {
  if (!env.ASSETS_BUCKET) return;
  try {
    let cursor;
    do {
      const listed = await env.ASSETS_BUCKET.list({ prefix: `r/${restaurantId}/`, cursor });
      if (listed.objects.length) {
        await env.ASSETS_BUCKET.delete(listed.objects.map((object) => object.key));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'adapter.purge.images_failed',
      restaurant_id: restaurantId,
      error_message: String(error?.message || error).slice(0, 200),
    }));
  }
}

async function health(env, requestId, tenantIdFromPath) {
  const tenantId = adapterRequired(tenantIdFromPath, 'INVALID_TENANT_ID', 80);
  const row = await env.DB.prepare(
    `SELECT restaurant_id, environment, plan_code, lifecycle_status, is_active, slug
     FROM restaurants WHERE control_tenant_id = ?`,
  ).bind(tenantId).first();
  if (!row) throw new HttpError(404, 'TENANT_NOT_FOUND', 'Product tenant was not found.');
  return json({
    ok: true, request_id: requestId, tenant_id: tenantId,
    external_tenant_id: row.restaurant_id, environment: row.environment,
    plan_code: row.plan_code, status: row.lifecycle_status,
    active: Boolean(row.is_active), public_url: publicSiteUrl(env, row.slug),
    checked_at: new Date().toISOString(),
  });
}

export async function handleAdapter(request, env) {
  let signed;
  try {
    signed = await verifyAdapterRequest(request, env);
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (path === '/internal/v1/tenants' && method === 'POST') return await provision(env, signed);

    const statusMatch = path.match(/^\/internal\/v1\/tenants\/([^/]+)\/status$/);
    if (statusMatch && method === 'POST') return await changeStatus(env, signed, decodeURIComponent(statusMatch[1]));

    const planMatch = path.match(/^\/internal\/v1\/tenants\/([^/]+)\/plan$/);
    if (planMatch && method === 'POST') return await changePlan(env, signed, decodeURIComponent(planMatch[1]));

    const profileMatch = path.match(/^\/internal\/v1\/tenants\/([^/]+)\/profile$/);
    if (profileMatch && method === 'POST') return await updateProfile(env, signed, decodeURIComponent(profileMatch[1]));

    const credentialMatch = path.match(/^\/internal\/v1\/tenants\/([^/]+)\/reset-owner-credential$/);
    if (credentialMatch && method === 'POST') {
      return await resetOwnerCredential(env, signed, decodeURIComponent(credentialMatch[1]));
    }

    const healthMatch = path.match(/^\/internal\/v1\/tenants\/([^/]+)\/health$/);
    if (healthMatch && method === 'GET') return await health(env, signed.requestId, decodeURIComponent(healthMatch[1]));

    const purgeMatch = path.match(/^\/internal\/v1\/tenants\/([^/]+)$/);
    if (purgeMatch && method === 'DELETE') return await purge(env, signed, decodeURIComponent(purgeMatch[1]));

    throw new HttpError(404, 'NOT_FOUND', 'Adapter route was not found.');
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : 'SERVER_ERROR';
    const message = error instanceof HttpError ? error.message : 'Unexpected product adapter failure.';
    console.error(JSON.stringify({
      event: 'adapter.error',
      request_id: signed?.requestId || '',
      code,
      status,
      error_name: error instanceof Error ? error.name : 'UnknownError',
      error_message: String(error instanceof Error ? error.message : error).slice(0, 300),
    }));
    return json({ ok: false, error: code, message, request_id: signed?.requestId || '' }, status);
  }
}
