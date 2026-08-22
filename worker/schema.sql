-- ============================================================
-- محرك المطاعم — مخطط D1 متعدد المستأجرين
-- ============================================================
-- منقول عن مشروع Django `adana-restaurant` مع إضافة `restaurant_id`
-- إلى كل صف تشغيلي. المشروع الأصلي يبقى مرجعًا حيًّا لسلوك متوقَّع،
-- و174 اختبارًا فيه هي مرجع التكافؤ.
--
-- فرق جوهري عن الصيدلية والمدرسة: هذان نظاما إدارة داخلية، أما المطعم
-- فموقعه العام هو المنتج. لذلك الجداول هنا علائقية صريحة لا مستندية:
-- الصفحة تُبنى على الخادم من هذه الصفوف، والبحث والترتيب والفلترة
-- تحتاج أعمدة حقيقية لا JSON.
--
-- المبالغ أعداد صحيحة بأصغر وحدة نقدية. لا REAL في أي مكان.

-- ---------- المطاعم (المستأجرون) ----------
CREATE TABLE IF NOT EXISTS restaurants (
  restaurant_id     TEXT PRIMARY KEY,
  control_tenant_id TEXT,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  environment       TEXT NOT NULL DEFAULT 'production'
                    CHECK (environment IN ('demo', 'production')),
  plan_code         TEXT NOT NULL DEFAULT 'menu'
                    CHECK (plan_code IN ('menu', 'full')),
  trial_expires_at  TEXT,
  lifecycle_status  TEXT NOT NULL DEFAULT 'active'
                    CHECK (lifecycle_status IN ('active', 'suspended', 'archived')),
  is_active         INTEGER NOT NULL DEFAULT 1,
  seed_version      TEXT NOT NULL DEFAULT '',
  -- أي هوية من بنك الهويات الأربع طُبِّقت عند الإنشاء. معلوماتية: الهوية
  -- الفعلية بعد الإنشاء هي ما في `settings` وحدها، والمطعم يعدّلها بحرّية.
  brand_kit_code    TEXT NOT NULL DEFAULT '',
  provisioned_at    INTEGER,
  created_at        INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL DEFAULT 0
);

-- الرابط العام مبني على الـslug، فيجب أن يدل على مطعم واحد لا أكثر.
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants (slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_control_tenant
  ON restaurants (control_tenant_id)
  WHERE control_tenant_id IS NOT NULL AND control_tenant_id != '';

-- ---------- الهوية والإعدادات (Brand Kit) ----------
-- 81 حقلًا في المشروع الأصلي، وهي ما يجعل مطعمين بنفس الشيفرة مختلفين
-- تمامًا: الألوان والخطوط وكل نص قسم بلغتين. لا شيء منها مكتوب في الكود.
CREATE TABLE IF NOT EXISTS settings (
  restaurant_id TEXT PRIMARY KEY,

  -- الأسماء والشعار النصي
  name_ar TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  tagline_ar TEXT NOT NULL DEFAULT '', tagline_en TEXT NOT NULL DEFAULT '',

  -- الواجهة
  hero_title_ar TEXT NOT NULL DEFAULT '', hero_title_en TEXT NOT NULL DEFAULT '',
  hero_text_ar TEXT NOT NULL DEFAULT '', hero_text_en TEXT NOT NULL DEFAULT '',
  hero_image_url TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  og_image_url TEXT NOT NULL DEFAULT '',

  -- الألوان: كل واحد يُتحقق منه قبل الحفظ، ويُحقن كمتغيّر CSS
  primary_color TEXT NOT NULL DEFAULT '#E30613',
  gold_color TEXT NOT NULL DEFAULT '#D4AF37',
  background_color TEXT NOT NULL DEFAULT '#050505',
  surface_color TEXT NOT NULL DEFAULT '#111111',
  whatsapp_color TEXT NOT NULL DEFAULT '#25D366',
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  -- طبقة الثيم الإضافية فوق الأنماط الأساسية، كما في أضنة (`theme_css`):
  -- تُحمَّل بعد الورقة الأساسية فلا تعدّلها، فقط تزيد عليها. القيم من
  -- بنك الهويات الأربع في `brandkits.js`، أو فارغة للتصميم الافتراضي.
  theme_layer TEXT NOT NULL DEFAULT '',

  -- الخطوط
  arabic_font TEXT NOT NULL DEFAULT 'Cairo',
  arabic_display_font TEXT NOT NULL DEFAULT 'Cairo',
  display_font TEXT NOT NULL DEFAULT 'Playfair Display',
  latin_font TEXT NOT NULL DEFAULT 'Inter',

  -- عناوين الأقسام
  about_title_ar TEXT NOT NULL DEFAULT '', about_title_en TEXT NOT NULL DEFAULT '',
  about_text_ar TEXT NOT NULL DEFAULT '', about_text_en TEXT NOT NULL DEFAULT '',
  menu_title_ar TEXT NOT NULL DEFAULT '', menu_title_en TEXT NOT NULL DEFAULT '',
  featured_title_ar TEXT NOT NULL DEFAULT '', featured_title_en TEXT NOT NULL DEFAULT '',
  offers_title_ar TEXT NOT NULL DEFAULT '', offers_title_en TEXT NOT NULL DEFAULT '',
  services_title_ar TEXT NOT NULL DEFAULT '', services_title_en TEXT NOT NULL DEFAULT '',
  reviews_title_ar TEXT NOT NULL DEFAULT '', reviews_title_en TEXT NOT NULL DEFAULT '',
  reservation_title_ar TEXT NOT NULL DEFAULT '', reservation_title_en TEXT NOT NULL DEFAULT '',
  reservation_text_ar TEXT NOT NULL DEFAULT '', reservation_text_en TEXT NOT NULL DEFAULT '',
  faq_title_ar TEXT NOT NULL DEFAULT '', faq_title_en TEXT NOT NULL DEFAULT '',
  social_title_ar TEXT NOT NULL DEFAULT '', social_title_en TEXT NOT NULL DEFAULT '',

  -- نصوص الأزرار
  order_cta_ar TEXT NOT NULL DEFAULT '', order_cta_en TEXT NOT NULL DEFAULT '',
  menu_cta_ar TEXT NOT NULL DEFAULT '', menu_cta_en TEXT NOT NULL DEFAULT '',
  whatsapp_panel_text_ar TEXT NOT NULL DEFAULT '', whatsapp_panel_text_en TEXT NOT NULL DEFAULT '',

  -- SEO والتذييل
  seo_title_ar TEXT NOT NULL DEFAULT '', seo_title_en TEXT NOT NULL DEFAULT '',
  seo_description_ar TEXT NOT NULL DEFAULT '', seo_description_en TEXT NOT NULL DEFAULT '',
  footer_text_ar TEXT NOT NULL DEFAULT '', footer_text_en TEXT NOT NULL DEFAULT '',

  -- الاتصال
  whatsapp_number TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address_ar TEXT NOT NULL DEFAULT '', address_en TEXT NOT NULL DEFAULT '',
  hours_ar TEXT NOT NULL DEFAULT '', hours_en TEXT NOT NULL DEFAULT '',
  instagram_url TEXT NOT NULL DEFAULT '',
  facebook_url TEXT NOT NULL DEFAULT '',

  currency TEXT NOT NULL DEFAULT '₪',
  order_code_prefix TEXT NOT NULL DEFAULT 'ORD',

  -- إظهار الأقسام: ترتيب الصفحة وحضور كل قسم قرار للمطعم لا للكود
  show_about INTEGER NOT NULL DEFAULT 1,
  show_categories INTEGER NOT NULL DEFAULT 1,
  show_featured INTEGER NOT NULL DEFAULT 1,
  show_offers INTEGER NOT NULL DEFAULT 1,
  show_services INTEGER NOT NULL DEFAULT 1,
  show_reviews INTEGER NOT NULL DEFAULT 1,
  show_reservation INTEGER NOT NULL DEFAULT 1,
  show_faq INTEGER NOT NULL DEFAULT 1,
  show_social INTEGER NOT NULL DEFAULT 1,

  -- قواعد الحجز
  reservation_open_time TEXT NOT NULL DEFAULT '12:00',
  reservation_close_time TEXT NOT NULL DEFAULT '23:00',
  reservation_slot_minutes INTEGER NOT NULL DEFAULT 30,
  max_reservations_per_slot INTEGER NOT NULL DEFAULT 4,
  max_reservation_days_ahead INTEGER NOT NULL DEFAULT 30,

  updated_at INTEGER NOT NULL DEFAULT 0
);

-- ---------- المستخدمون ----------
-- خارج أي جدول مزامَن: التجزئة لا تغادر الخادم.
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  restaurant_id       TEXT NOT NULL,
  username            TEXT NOT NULL,
  display_name        TEXT NOT NULL DEFAULT '',
  role                TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'cashier')),
  password_hash       TEXT NOT NULL,
  password_salt       TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL DEFAULT 0,
  updated_at          INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (restaurant_id, username);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  role          TEXT NOT NULL,
  device_id     TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_restaurant ON sessions (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- ---------- محتوى الصفحة ----------
CREATE TABLE IF NOT EXISTS hero_stats (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_hero_stats_r ON hero_stats (restaurant_id, display_order);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories (restaurant_id, slug);
CREATE INDEX IF NOT EXISTS idx_categories_r ON categories (restaurant_id, display_order);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  -- السعر بأصغر وحدة. `price_minor = 0` مع `is_priced = 0` تعني «حسب الطلب».
  price_minor INTEGER NOT NULL DEFAULT 0,
  old_price_minor INTEGER NOT NULL DEFAULT 0,
  is_priced INTEGER NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL DEFAULT '',
  badge_ar TEXT NOT NULL DEFAULT '', badge_en TEXT NOT NULL DEFAULT '',
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_available INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat ON menu_items (restaurant_id, category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_featured ON menu_items (restaurant_id, is_featured, display_order);

-- الحجم يستبدل سعر الطبق ولا يضاف إليه؛ طبق بلا أحجام يعمل كما هو.
CREATE TABLE IF NOT EXISTS menu_item_variants (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  price_minor INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_item ON menu_item_variants (restaurant_id, menu_item_id, display_order);

-- الإضافة تُضاف إلى السعر ولا تستبدله.
CREATE TABLE IF NOT EXISTS menu_item_addons (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  price_minor INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_addons_item ON menu_item_addons (restaurant_id, menu_item_id, display_order);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  -- سعر العرض نص لا رقم: «٢ بسعر ١» ليست قيمة تُحسب.
  price_text_ar TEXT NOT NULL DEFAULT '', price_text_en TEXT NOT NULL DEFAULT '',
  old_price_text_ar TEXT NOT NULL DEFAULT '', old_price_text_en TEXT NOT NULL DEFAULT '',
  price_minor INTEGER NOT NULL DEFAULT 0,
  is_priced INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_offers_r ON offers (restaurant_id, display_order);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_services_r ON services (restaurant_id, display_order);

CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  review_ar TEXT NOT NULL DEFAULT '', review_en TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  avatar_url TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_testimonials_r ON testimonials (restaurant_id, display_order);

CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  question_ar TEXT NOT NULL DEFAULT '', question_en TEXT NOT NULL DEFAULT '',
  answer_ar TEXT NOT NULL DEFAULT '', answer_en TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_faqs_r ON faqs (restaurant_id, display_order);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  post_url TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_social_r ON social_posts (restaurant_id, display_order);

-- ---------- الحجوزات ----------
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests INTEGER NOT NULL DEFAULT 2,
  occasion TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new'
         CHECK (status IN ('new', 'contacted', 'confirmed', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reservations_slot ON reservations (restaurant_id, date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_list ON reservations (restaurant_id, created_at);

-- ---------- الطلبات ----------
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  -- الرمز يُقرأ على الهاتف، والرابط العام يُخمَّن. لذلك الوصول بـtoken
  -- غير قابل للتوقع، لا بمعرّف متسلسل.
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
         CHECK (status IN ('new', 'confirmed', 'preparing', 'delivered', 'cancelled')),
  fulfillment TEXT NOT NULL DEFAULT 'pickup'
              CHECK (fulfillment IN ('pickup', 'delivery', 'dine_in')),
  source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'cashier')),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_count INTEGER NOT NULL DEFAULT 1,
  table_number TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  cashier_id TEXT,
  total_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '₪',
  has_unpriced_lines INTEGER NOT NULL DEFAULT 0,
  -- اسم المطعم وشعاره نسخة لا مرجع: تغيير الهوية لاحقًا لا يعيد كتابة إيصال قديم.
  restaurant_name TEXT NOT NULL DEFAULT '',
  restaurant_tagline TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_token ON orders (token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_code ON orders (restaurant_id, code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (restaurant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_list ON orders (restaurant_id, created_at);

-- سطر مسعّر واحد. الأسماء والأسعار نسخ لا مراجع، فتعديل المنيو لاحقًا
-- لا يعيد كتابة طلب سابق.
CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  menu_item_id TEXT,
  offer_id TEXT,
  variant_name_ar TEXT NOT NULL DEFAULT '',
  addons_json TEXT NOT NULL DEFAULT '[]',
  name_ar TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  unit_price_minor INTEGER NOT NULL DEFAULT 0,
  is_priced INTEGER NOT NULL DEFAULT 1,
  price_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines (restaurant_id, order_id);

-- ---------- سجل التدقيق ----------
CREATE TABLE IF NOT EXISTS restaurant_audit (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_restaurant_audit_r ON restaurant_audit (restaurant_id, at);

-- ---------- طلبات المحوّل ----------
CREATE TABLE IF NOT EXISTS adapter_requests (
  request_id    TEXT PRIMARY KEY,
  action        TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'succeeded', 'failed')),
  response_json TEXT NOT NULL DEFAULT '{}',
  error_code    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  completed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_adapter_requests_tenant ON adapter_requests (tenant_id, created_at);
