/**
 * يبني صور النسخة التجريبية من المشاريع الثلاثة الأصلية.
 *
 * الاختيار بُني على *مشاهدة* الصور لا على أسمائها: أسماء الملفات مضلّلة
 * (`cat-eastern-v2` هو كباب أضنة نفسه، و`cat-desserts-v2` كنافة).
 *
 * صور Fries Station مستبعدة كلها: خلفياتها بيج/بيضاء بينما أضنة وB12
 * استوديو داكن موحّد. خلطها يجعل الصفحة تبدو مجمَّعة من مصادر متفرقة.
 *
 * المقاسات من `render.js`: البطاقات 960×720، والغلاف 1672×941.
 */
/*
 * التشغيل: انسخ المستودعات الثلاثة بجانب هذا المشروع ثم
 *   node scripts/build-demo-images.mjs <مجلد-المستودعات>
 * النتيجة تُكتب في `public/site/img/demo/` وتُرفع مع الـWorker كأصول ثابتة.
 * لا يعمل تلقائيًا في أي بناء: يُشغَّل يدويًا عند تغيير الصور فقط.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const R = process.argv[2] ? `${process.argv[2].replace(/[/\\]$/, '')}/` : 'refs/';
const A = `${R}adana-restaurant/static/restaurant/img/`;
const B = `${R}b12-restaurant-hot/static/restaurant/img/v3/`;
const OUT = fileURLToPath(new URL('../public/site/img/demo/', import.meta.url));

// المفتاح = مفتاح الصنف في seed.js. ما لا يجد صورة صادقة يُترك بلا صورة:
// صورة خاطئة أسوأ من بطاقة بلا صورة، والتصميم يتعامل مع غيابها أصلًا.
const DISHES = {
  adana: `${A}adana-brand/cat-eastern-v2.webp`,        // كباب أضنة على الخبز
  shish: `${A}adana/dishes/shish-tawook.webp`,
  mixgrill: `${B}mixed-grill.webp`,
  chops: `${B}steak.webp`,
  shawarma: `${B}shawarma.webp`,
  chickenshawarma: `${A}adana/dishes/mr-crispy-sandwich.webp`,
  burger: `${A}adana/dishes/adana-burger.webp`,
  arayes: `${A}adana/dishes/philadelphia-sandwich.webp`,
  hummus: `${A}adana/dishes/hummus.webp`,
  fries: `${A}adana/dishes/french-fries.webp`,
  lemonmint: `${A}adana-brand/cat-drinks-v2.webp`,
  coffee: `${A}adana/dishes/turkish-coffee.webp`,
  kunafa: `${A}adana-brand/cat-desserts-v2.webp`,      // كنافة فعلًا
};

const OFFERS = {
  family: `${A}adana-brand/offer-family-v2.webp`,
  two: `${A}adana-brand/offer-burger-v2.webp`,
  lunch: `${A}adana/dishes/chicken-mandi-rice.webp`,
  breakfast: `${A}adana/dishes/lamb-rice.webp`,
};

const CATEGORIES = {
  grill: `${A}adana/dishes/charcoal-chicken.webp`,
  sandwich: `${A}adana-brand/cat-western-v2.webp`,
  mezze: `${A}adana/dishes/mozzarella-sticks.webp`,
  drinks: `${B}drinks.webp`,
  sweets: `${B}dessert.webp`,
};

const HERO = `${A}adana-brand/hero-v2.webp`;

mkdirSync(join(OUT, 'dish'), { recursive: true });
mkdirSync(join(OUT, 'offer'), { recursive: true });
mkdirSync(join(OUT, 'category'), { recursive: true });

// جودة 66: قِستُ 60/66/72/80/88 على صورة الكباب (86/92/99/122/169KB)
// وقارنتُها بصريًا — لا فرق يُرى بين 60 و88 عند حجم العرض، فالمنحنى مسطّح.
// 66 هامش فوق الأدنى بلا ثمن يُذكر. الأبعاد تبقى 960×720 لأن `render.js`
// يصرّح بها في `width`/`height`، وتصغيرها يجعل التصريح كاذبًا.
const card = (src, dest) => sharp(src)
  .resize(960, 720, { fit: 'cover', position: 'centre' })
  .webp({ quality: 66, effort: 6 }).toFile(dest);

const hero = (src, dest) => sharp(src)
  .resize(1672, 941, { fit: 'cover', position: 'centre' })
  .webp({ quality: 68, effort: 6 }).toFile(dest);

const jobs = [];
for (const [key, src] of Object.entries(DISHES)) jobs.push(card(src, join(OUT, 'dish', `${key}.webp`)));
for (const [key, src] of Object.entries(OFFERS)) jobs.push(card(src, join(OUT, 'offer', `${key}.webp`)));
for (const [key, src] of Object.entries(CATEGORIES)) jobs.push(card(src, join(OUT, 'category', `${key}.webp`)));
jobs.push(hero(HERO, join(OUT, 'hero.webp')));
await Promise.all(jobs);

let total = 0; let count = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path);
    else { total += info.size; count += 1; }
  }
};
walk(OUT);
console.log(`صورة: ${count} | المجموع: ${(total / 1024).toFixed(0)}KB | المتوسط: ${(total / count / 1024).toFixed(0)}KB`);
console.log(`بلا صورة عمدًا: falafel, tabbouleh, salad, ayran, tea, baklava, rizbihaleeb`);
