-- الوضع الفاتح للهويات.
--
-- كان `style.css` يُعرّف `--text` و`--muted` و`--line` بقيم داكنة،
-- و`rootVars` لا تُبدّلها — فبقيت مثبَّتة مهما كانت أرضية الهوية فاتحة،
-- وتبديل الألوان وحده يُنتج صفحة يختفي نصُّها.
--
-- والافتراضات داكنة كما كانت: مطعمٌ قائم لا يتبدّل شكله بهذا الترحيل.
ALTER TABLE settings ADD COLUMN text_color TEXT NOT NULL DEFAULT '#FFFFFF';
ALTER TABLE settings ADD COLUMN muted_color TEXT NOT NULL DEFAULT '#B8B8B8';
ALTER TABLE settings ADD COLUMN line_color TEXT NOT NULL DEFAULT 'rgba(255,255,255,.14)';
