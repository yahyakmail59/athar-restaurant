/**
 * السلة تحمل الحجم والإضافات إلى الخادم.
 *
 * لماذا هذا الملف موجود: كانت `site/js/main.js` تقبل معرّف الحجم والإضافة
 * **إن كان أرقامًا فقط** (`/^\d+$/`)، ومعرّفات هذا المحرك نصّية
 * (`var_0epjvn8_adana_1`). فكل اختيار يُسقَط بصمت: يُحسب في العرض ولا
 * يُرسَل.
 *
 * أثره في الواقع، وقد رأيته حيًّا على `dora.athar.date`: زبون يطلب «كباب
 * أضنة كبير + أرز إضافي» فتعرض الشاشة 83 ₪، وتصل المطعم رسالة تقول:
 *
 *     • 1 × كباب أضنة — 55.00 ₪
 *
 * بلا حجم وبلا إضافة وبثمانية وعشرين شيكلًا أقلّ. المطعم يخسر المال ويرسل
 * الطبق الخطأ، والزبون ينتظر ما اختاره. عطلٌ في أهمّ فعل في المنتج كلّه.
 *
 * والخادم كان بريئًا: `priceLines` تقرأ `variant_id` و`addon_ids` وتُسعّر
 * بهما، واختبار التكامل يمرّرهما فيمرّ. لكن لا شيء كان يفحص أن الواجهة
 * **ترسلهما أصلًا** — وهذه هي المسافة التي تسكنها الأعطال.
 *
 * التشغيل: node worker/tests/cart-ids.contract.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../public/site/js/main.js', import.meta.url), 'utf8');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

check(
  'لا مرشّح رقميّ على معرّفات الحجم والإضافات',
  !/\/\^\\d\+\$\/\.test\(String\(item\.variantId/.test(source)
  && !/\/\^\\d\+\$\/\.test\(button\.dataset\.variantId/.test(source),
  'المعرّفات نصّية، ومرشّح الأرقام يُسقطها بصمت',
);

const validId = source.match(/const VALID_ID = (\/[^\n;]+\/);/)?.[1];
check('شكل المعرّف مُعلَن', Boolean(validId), validId || '(غير موجود)');

if (validId) {
  // eslint-disable-next-line no-new-func
  const pattern = new Function(`return ${validId};`)();
  check(
    'يقبل معرّفات المحرك الحقيقية',
    pattern.test('var_0epjvn8_adana_1') && pattern.test('addon_0epjvn8_rice')
    && pattern.test('item_0epjvn8_adana'),
    'وهي التي رأيتها في الإنتاج',
  );
  check(
    'ويرفض ما ليس معرّفًا',
    !pattern.test('') && !pattern.test('a b') && !pattern.test('<script>')
    && !pattern.test('x'.repeat(200)),
    'التصفية تبقى — الخادم يتحقّق، لكن لا يُرسَل نصّ عشوائي أصلًا',
  );
}

check(
  'مفتاح السلة يفصل الأحجام والإضافات',
  source.includes('cartKey: `${id}:${variantId || \'\'}:${addonIds.join(\',\')}`'),
  'وإلا اندمج «كبير» مع «وسط» في سطر واحد بسعر أحدهما',
);

check(
  'الطلب يرسل المعرّفين إلى الخادم',
  source.includes('variant_id: item.variantId') && source.includes('addon_ids: item.addonIds'),
);

const failed = checks.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} فحصًا فشل.`);
  process.exit(1);
}
console.log('\nrestaurant-cart-ids-contract-ok');
