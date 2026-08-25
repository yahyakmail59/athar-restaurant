/**
 * لوحة المطعم.
 *
 * لا حالة على الجهاز غير رمز الجلسة: كل قراءة من الخادم. هذا مقصود ومختلف
 * عن محرك المدارس الذي يعمل بلا إنترنت — المطعم شبكته موجودة، والكاشير الذي
 * يرى قائمة قديمة يبيع بسعر قديم.
 *
 * كل منع هنا مكرَّر على الخادم. إخفاء زر راحةٌ للمستخدم لا حماية: الطلب
 * المصنوع بيد يتجاوز أي إخفاء.
 */

const TOKEN_KEY = 'athar.restaurant.token';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  // `dataset` يُنسخ حقلًا حقلًا: إسناده مباشرة على العنصر يرمي في الوضع
  // الصارم لأن `DOMStringMap` بلا واضع، والملف وحدة فهو صارم دائمًا.
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of [].concat(children)) {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  me: null,
  meta: null,
  settings: {},
  categories: [],
  items: [],
  ticket: [],
  orderFilter: '',
};

/* ==================== الاتصال ==================== */

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof Uint8Array || options.body instanceof Blob)
        ? { 'Content-Type': 'application/json' } : {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch { /* رد غير JSON يُعامَل كعطل عام */ }

  if (response.status === 401 && state.token) {
    signOut('انتهت الجلسة. سجّل الدخول من جديد.');
    throw new Error('SESSION_EXPIRED');
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || 'تعذّر إتمام العملية.');
    error.code = payload.error || 'ERROR';
    throw error;
  }
  return payload;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

/**
 * رسالة عابرة — بنمط `.toast` عند أضنة (بديل إطار `messages` في Django،
 * الذي لا مقابل له في تطبيق صفحة واحدة يقرأ من JSON).
 */
function toast(message, kind = 'ok') {
  const host = $('toasts');
  const node = el('p', { className: `toast toast-${kind === 'error' ? 'error' : 'success'}`, textContent: message });
  host.append(node);
  setTimeout(() => node.remove(), 4000);
}

const money = (minor) => `${(Number(minor || 0) / 100).toFixed(2)} ${state.settings.currency || '₪'}`;

/* ==================== الدخول ==================== */

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  const error = $('login-error');
  button.disabled = true;
  error.textContent = '';
  try {
    const result = await post('/api/login', {
      restaurant_id: $('login-restaurant').value.trim(),
      username: $('login-username').value.trim(),
      password: $('login-password').value,
    });
    state.token = result.token;
    localStorage.setItem(TOKEN_KEY, result.token);
    $('login-password').value = '';
    await bootstrap();
  } catch (failure) {
    error.textContent = failure.message;
    error.className = 'msg error';
  } finally {
    button.disabled = false;
  }
});

function signOut(message) {
  state.token = '';
  state.me = null;
  localStorage.removeItem(TOKEN_KEY);
  $('app-view').hidden = true;
  $('login-view').hidden = false;
  if (message) {
    $('login-error').textContent = message;
    $('login-error').className = 'msg error';
  }
}

$('logout').addEventListener('click', async () => {
  try {
    await post('/api/logout', {});
  } catch { /* الخروج محليًا يحدث مهما ردّ الخادم */ }
  signOut('');
});

/* ==================== التنقل ==================== */

const panels = ['dashboard', 'orders', 'cashier', 'reservations', 'menu', 'content', 'identity', 'users', 'account'];

const loaders = {
  dashboard: loadDashboard,
  orders: loadOrders,
  cashier: loadCashier,
  reservations: loadReservations,
  menu: loadMenu,
  content: loadContent,
  identity: loadIdentity,
  users: loadUsers,
  account: async () => {},
};

const PANEL_TITLES = {
  dashboard: ['لوحة التشغيل', ''],
  orders: ['الطلبات', ''],
  cashier: ['كاشير المطعم', 'سجّل طلبات الطاولات لتدخل في المبيعات والتقارير.'],
  reservations: ['الحجوزات', ''],
  menu: ['المنيو', ''],
  content: ['المحتوى', ''],
  identity: ['الهوية والموقع', ''],
  users: ['الحسابات', ''],
  account: ['حسابي', ''],
};

async function showPanel(name) {
  for (const panel of panels) $(`panel-${panel}`).hidden = panel !== name;
  for (const button of document.querySelectorAll('.side-link[data-panel]')) {
    button.classList.toggle('is-active', button.dataset.panel === name);
  }
  const [title, sub] = PANEL_TITLES[name] || ['', ''];
  $('panel-heading').textContent = title;
  $('panel-sub').textContent = sub;
  $('sidebar').classList.remove('is-open');
  document.querySelector('[data-nav-toggle]').setAttribute('aria-expanded', 'false');
  try {
    await loaders[name]();
  } catch (failure) {
    if (failure.message !== 'SESSION_EXPIRED') toast(failure.message, 'error');
  }
}

document.querySelectorAll('.side-link[data-panel]').forEach((button) => {
  button.addEventListener('click', () => showPanel(button.dataset.panel));
});

document.querySelector('[data-nav-toggle]').addEventListener('click', () => {
  const open = $('sidebar').classList.toggle('is-open');
  document.querySelector('[data-nav-toggle]').setAttribute('aria-expanded', String(open));
});

// تبديل الثيم — نفس مفتاح localStorage الذي تقرؤه سكربت ما قبل الرسم في
// index.html، فلا يومض الوضع الخطأ عند إعادة التحميل.
document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* وضع خاص */ }
  document.querySelector('[data-theme-toggle]').setAttribute('aria-pressed', String(next === 'dark'));
  document.querySelector('[data-theme-label]').textContent = next === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
});

/* ==================== الإقلاع ==================== */

async function bootstrap() {
  if (!state.token) {
    signOut('');
    return;
  }
  const [info] = await Promise.all([
    api('/api/me'),
    // قوائم الخطوط والأيقونات مرة واحدة لكل جلسة، لا لكل نافذة تحرير.
    state.meta ? Promise.resolve() : api('/api/meta').then((meta) => { state.meta = meta; }),
  ]);
  state.me = info;
  state.settings = info.settings || {};

  $('login-view').hidden = true;
  $('app-view').hidden = false;
  $('restaurant-name').textContent = `لوحة التحكم — ${info.restaurant.name}`;
  $('public-link').href = info.restaurant.public_url;
  $('foot-name').textContent = `${info.restaurant.name} — لوحة أثر`;

  if (state.settings.logo_url) {
    $('sidebar-logo').src = state.settings.logo_url;
    $('sidebar-logo').alt = info.restaurant.name;
    $('sidebar-logo').hidden = false;
    $('sidebar-wordmark').hidden = true;
  } else {
    $('sidebar-wordmark').textContent = info.restaurant.name;
  }
  $('sidebar-logo-link').href = info.restaurant.public_url;

  const initial = (info.user.name || info.user.username || '؟').trim().slice(0, 1);
  $('who-avatar').textContent = initial;
  $('who-name').textContent = info.user.name || info.user.username;
  $('who-role').textContent = ROLE_LABEL_TOP[info.user.role] || '';

  const plan = $('plan-badge');
  plan.textContent = info.restaurant.plan_code === 'full' ? 'الباقة الكاملة' : 'باقة المنيو';
  $('env-badge').hidden = info.restaurant.environment !== 'demo';

  // ما لا تشمله الباقة يُخفى من التنقل. الخادم يرفضه أيضًا؛ الإخفاء يمنع
  // أن يضغط المستخدم زرًا ليُقال له «غير متاح».
  const gated = {
    orders: info.features.orders,
    cashier: info.features.cashier,
    reservations: info.features.reservations,
    dashboard: info.features.dashboard,
    users: info.user.role === 'owner',
    identity: info.user.role !== 'cashier',
    menu: info.user.role !== 'cashier',
    content: info.user.role !== 'cashier',
  };
  for (const button of document.querySelectorAll('.side-link[data-panel]')) {
    const allowed = gated[button.dataset.panel];
    button.hidden = allowed === false;
  }

  const first = [...document.querySelectorAll('.side-link[data-panel]')].find((button) => !button.hidden);
  await showPanel(first ? first.dataset.panel : 'account');
}

const ROLE_LABEL_TOP = { owner: 'المالك', manager: 'مدير', cashier: 'كاشير' };

/* ==================== لوحة التشغيل ==================== */

async function loadDashboard() {
  const data = await api('/api/dashboard');
  $('kpis').replaceChildren(...[
    ['طلبات اليوم', data.today.orders],
    ['إيراد اليوم', money(data.today.revenue)],
    ['طلبات الأسبوع', data.week.orders],
    ['إيراد الأسبوع', money(data.week.revenue)],
    ['حجوزات تنتظر ردًّا', data.pending_reservations],
    ['طلبات جديدة', data.by_status.new || 0],
  ].map(([label, value]) => el('article', { className: 'counter' }, [
    el('div', { className: 'counter-head' }, [el('span', { className: 'counter-label', textContent: label })]),
    el('b', { className: 'counter-value', textContent: String(value) }),
  ])));

  $('top-items').replaceChildren(table(
    ['الصنف', 'الكمية', 'الإيراد'],
    data.top_items.map((row) => [row.name_ar, row.sold, money(row.revenue)]),
    'لا مبيعات هذا الأسبوع بعد.',
  ));
}

/** جدول بنمط أضنة (`.table-wrap` > `table.data`) — قسم جديد لا يعيد بناءه. */
function table(headers, rows, emptyText) {
  if (!rows.length) return el('p', { className: 'empty', textContent: emptyText });
  const head = el('tr', {}, headers.map((label) => el('th', { textContent: label })));
  const body = rows.map((cells) => el('tr', {}, cells.map((cell) =>
    el('td', {}, [cell instanceof Node ? cell : String(cell)]))));
  return el('div', { className: 'table-wrap' }, [
    el('table', { className: 'data' }, [el('thead', {}, [head]), el('tbody', {}, body)]),
  ]);
}

/* ==================== الطلبات ==================== */

const STATUS_LABEL = {
  new: 'جديد', confirmed: 'مؤكَّد', preparing: 'قيد التحضير',
  delivered: 'مُسلَّم', cancelled: 'ملغى',
};
const NEXT_STATUS = { new: 'confirmed', confirmed: 'preparing', preparing: 'delivered' };
const FULFILLMENT_LABEL = { pickup: 'استلام', delivery: 'توصيل', dine_in: 'في المطعم' };

document.querySelectorAll('#order-filters .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    state.orderFilter = chip.dataset.status;
    document.querySelectorAll('#order-filters .chip').forEach((other) =>
      other.classList.toggle('chip-on', other === chip));
    loadOrders().catch((failure) => toast(failure.message, 'error'));
  });
});

$('orders-refresh').addEventListener('click', () => loadOrders().catch((failure) => toast(failure.message, 'error')));

async function loadOrders() {
  const query = state.orderFilter ? `?status=${encodeURIComponent(state.orderFilter)}` : '';
  const data = await api(`/api/orders${query}`);
  const host = $('orders-list');
  if (!data.orders.length) {
    host.replaceChildren(el('p', { className: 'empty', textContent: 'لا طلبات في هذا التصنيف.' }));
    return;
  }
  host.replaceChildren(...data.orders.map(orderCard));
}

function orderCard(order) {
  const lines = order.lines.map((line) => {
    let addons = [];
    try {
      addons = JSON.parse(line.addons_json || '[]');
    } catch { /* سطر بإضافات تالفة يُعرض بلا إضافات */ }
    const meta = [line.variant_name_ar, ...addons.map((addon) => addon.name_ar)].filter(Boolean).join(' · ');
    const price = Number(line.is_priced)
      ? money(line.unit_price_minor * line.quantity)
      : (line.price_note || 'حسب الطلب');
    return el('li', { textContent: `${line.quantity} × ${line.name_ar}${meta ? ` (${meta})` : ''} — ${price}` });
  });

  const actions = [];
  const next = NEXT_STATUS[order.status];
  if (next) {
    actions.push(el('button', {
      className: 'btn btn-solid btn-small', type: 'button',
      textContent: `→ ${STATUS_LABEL[next]}`,
      onclick: () => moveOrder(order.id, next),
    }));
  }
  if (order.status !== 'cancelled' && order.status !== 'delivered') {
    actions.push(el('button', {
      className: 'btn btn-small', type: 'button', textContent: 'إلغاء',
      onclick: () => moveOrder(order.id, 'cancelled'),
    }));
  }
  if (state.me.features.receipts && order.token) {
    actions.push(el('a', {
      className: 'btn btn-small', target: '_blank', rel: 'noopener',
      href: `${state.me.restaurant.public_url}o/${order.token}/receipt.png`,
      textContent: 'الإيصال',
    }));
  }

  const contact = [
    order.table_number && `طاولة ${order.table_number}`,
    order.phone,
    order.address,
  ].filter(Boolean).join(' · ');

  return el('article', { className: 'order-card' }, [
    el('header', {}, [
      el('code', { textContent: order.code }),
      el('span', { className: `status-badge status-${order.status}`, textContent: STATUS_LABEL[order.status] }),
      el('span', { className: 'status-badge', textContent: FULFILLMENT_LABEL[order.fulfillment] || '' }),
    ]),
    el('div', { className: 'muted', textContent: `${order.customer_name}${contact ? ` — ${contact}` : ''}` }),
    el('ul', {}, lines),
    Number(order.has_unpriced_lines)
      ? el('p', { className: 'muted', textContent: 'يشمل أصنافًا تُسعَّر عند التحضير.' })
      : el('span'),
    order.notes ? el('p', { textContent: `ملاحظة: ${order.notes}` }) : el('span'),
    el('p', { className: 'total', textContent: `الإجمالي ${money(order.total_minor)}` }),
    el('div', { className: 'actions' }, actions),
  ]);
}

async function moveOrder(id, status) {
  try {
    await post(`/api/orders/${encodeURIComponent(id)}/status`, { status });
    toast(`الطلب الآن: ${STATUS_LABEL[status]}`);
    await loadOrders();
  } catch (failure) {
    toast(failure.message, 'error');
  }
}

/* ==================== الكاشير ====================
 *
 * بنمط أضنة: عدّاد كمية على كل صنف مجموع تحت قسمه، لا سلّة نقر-فأضِف.
 * الكاشير يرى القائمة كلها دفعة واحدة ويضبط الأرقام، وهذا أسرع على شاشة
 * لمس حين تكون الأصناف معروفة (عكس زبون يستكشف المنيو لأول مرة). */

async function loadCashier() {
  await refreshMenuData();
  state.ticket = [];
  renderCashierMenu();
  renderCashierTotals();
  $('cashier-result').hidden = true;

  const stats = await api('/api/dashboard');
  $('cashier-stats').replaceChildren(...[
    ['طلبات اليوم', stats.today.orders],
    ['إيراد اليوم', money(stats.today.revenue)],
    ['طلبات الأسبوع', stats.week.orders],
  ].map(([label, value]) => el('article', {}, [
    el('span', { textContent: label }), el('b', { textContent: String(value) }),
  ])));

  await loadCashierRecent();
}

function renderCashierMenu() {
  const byCategory = new Map(state.categories.map((category) => [category.id, []]));
  for (const item of state.items) {
    if (Number(item.is_available) && byCategory.has(item.category_id)) byCategory.get(item.category_id).push(item);
  }
  $('cashier-categories').replaceChildren(...state.categories
    .filter((category) => byCategory.get(category.id)?.length)
    .map((category) => el('section', { className: 'cashier-category' }, [
      el('h3', { textContent: category.name_ar }),
      el('div', { className: 'cashier-items' }, byCategory.get(category.id).map(cashierItemRow)),
    ])));
}

function cashierItemRow(item) {
  const line = state.ticket.find((row) => row.item_id === item.id);
  const priced = Number(item.is_priced);
  const input = el('input', {
    type: 'number', min: '0', max: '99', inputMode: 'numeric',
    value: String(line?.quantity || 0),
    ariaLabel: `كمية ${item.name_ar}`,
    dataset: { itemId: item.id, price: String(item.price_minor), priced: priced ? '1' : '0' },
  });
  input.addEventListener('change', () => setCashierQuantity(item, Math.max(0, Math.min(99, Number(input.value) || 0))));

  const step = (delta) => {
    const next = Math.max(0, Math.min(99, Number(input.value || 0) + delta));
    input.value = String(next);
    setCashierQuantity(item, next);
  };

  return el('article', { className: 'cashier-item' }, [
    item.image_url
      ? el('img', { src: item.image_url, alt: '', width: 60, height: 45, loading: 'lazy' })
      : el('span', { className: 'cashier-item-placeholder', 'aria-hidden': 'true' }),
    el('div', { className: 'cashier-item-copy' }, [
      el('b', { textContent: item.name_ar }),
      el('small', { textContent: item.name_en || '' }),
      el('strong', { textContent: priced ? money(item.price_minor) : 'حسب الطلب' }),
    ]),
    el('div', { className: 'quantity-control' }, [
      el('button', { type: 'button', textContent: '−', ariaLabel: `إنقاص ${item.name_ar}`, onclick: () => step(-1) }),
      input,
      el('button', { type: 'button', textContent: '+', ariaLabel: `زيادة ${item.name_ar}`, onclick: () => step(1) }),
    ]),
  ]);
}

function setCashierQuantity(item, quantity) {
  const index = state.ticket.findIndex((row) => row.item_id === item.id);
  if (quantity <= 0) {
    if (index >= 0) state.ticket.splice(index, 1);
  } else if (index >= 0) {
    state.ticket[index].quantity = quantity;
  } else {
    state.ticket.push({
      item_id: item.id, quantity,
      priced: Number(item.is_priced), price: Number(item.price_minor),
    });
  }
  renderCashierTotals();
}

function renderCashierTotals() {
  const count = state.ticket.reduce((sum, line) => sum + line.quantity, 0);
  // إجمالي تقديري للعرض. الرقم الذي يُحفظ يحسبه الخادم من قاعدة البيانات.
  const total = state.ticket.reduce((sum, line) => sum + (line.priced ? line.price * line.quantity : 0), 0);
  document.querySelectorAll('[data-cashier-count]').forEach((node) => { node.textContent = String(count); });
  document.querySelectorAll('[data-cashier-total]').forEach((node) => { node.textContent = (total / 100).toFixed(2); });
  $('cashier-currency').textContent = state.settings.currency || '₪';
}

$('cashier-submit').addEventListener('click', async () => {
  const button = $('cashier-submit');
  const result = $('cashier-result');
  if (!state.ticket.length) {
    result.hidden = false; result.className = 'msg error'; result.textContent = 'اختر صنفًا واحدًا على الأقل.';
    return;
  }
  button.disabled = true;
  result.hidden = false; result.className = 'msg'; result.textContent = '';
  try {
    const order = await post('/api/orders', {
      customer_name: $('cashier-table').value.trim() || 'زبون',
      customer_count: Number($('cashier-count').value || 1),
      table_number: $('cashier-table').value.trim(),
      fulfillment: $('cashier-fulfillment').value,
      notes: $('cashier-notes').value.trim(),
      lines: state.ticket.map((line) => ({ item_id: line.item_id, quantity: line.quantity })),
    });
    state.ticket = [];
    $('cashier-table').value = '';
    $('cashier-count').value = '1';
    $('cashier-notes').value = '';
    renderCashierMenu();
    renderCashierTotals();
    result.className = 'msg ok';
    result.textContent = `سُجّل الطلب ${order.code} بإجمالي ${money(order.total_minor)}.`;
    await loadCashierRecent();
  } catch (failure) {
    result.className = 'msg error';
    result.textContent = failure.message;
  } finally {
    button.disabled = false;
  }
});

async function loadCashierRecent() {
  const data = await api('/api/orders?limit=10');
  const cashierOrders = data.orders.filter((order) => order.source === 'cashier');
  $('cashier-recent').replaceChildren(table(
    ['الطلب', 'الطاولة', 'الزبائن', 'الإجمالي', 'الوقت'],
    cashierOrders.map((order) => [
      order.token
        ? el('a', {
          href: `${state.me.restaurant.public_url}o/${order.token}/`, target: '_blank', rel: 'noopener',
          textContent: order.code,
        })
        : order.code,
      order.table_number || '—', order.customer_count,
      money(order.total_minor), new Date(order.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
    ]),
    'لا توجد طلبات مسجلة من الكاشير بعد.',
  ));
}

/* ==================== الحجوزات ==================== */

const RESERVATION_LABEL = { new: 'جديد', contacted: 'جرى التواصل', confirmed: 'مؤكَّد', cancelled: 'ملغى' };

$('reservations-refresh').addEventListener('click', () =>
  loadReservations().catch((failure) => toast(failure.message, 'error')));

async function loadReservations() {
  const data = await api('/api/reservations');
  $('reservations-list').replaceChildren(table(
    ['التاريخ', 'الوقت', 'الاسم', 'الهاتف', 'الضيوف', 'المناسبة', 'الحالة', ''],
    data.reservations.map((row) => [
      row.date, row.time, row.full_name, row.phone, row.guests, row.occasion || '—',
      el('span', { className: `status-badge status-${row.status}`, textContent: RESERVATION_LABEL[row.status] }),
      el('div', { className: 'actions' }, ['confirmed', 'contacted', 'cancelled']
        .filter((status) => status !== row.status)
        .map((status) => el('button', {
          className: 'btn btn-small', type: 'button', textContent: RESERVATION_LABEL[status],
          onclick: async () => {
            try {
              await post(`/api/reservations/${encodeURIComponent(row.id)}/status`, { status });
              await loadReservations();
            } catch (failure) {
              toast(failure.message, 'error');
            }
          },
        }))),
    ]),
    'لا حجوزات بعد.',
  ));
}

/* ==================== المنيو والمحتوى ==================== */

/**
 * وصف الحقول لكل قسم.
 *
 * النافذة تُبنى من هنا: قسم جديد = صف واحد. البديل — نموذج مكتوب بيد لكل
 * قسم — عشرة نماذج تتفرق فيها القواعد ثم تختلف.
 */
const FIELDS = {
  categories: [
    ['name_ar', 'الاسم بالعربية', 'text', true],
    ['name_en', 'الاسم بالإنجليزية', 'text'],
    ['slug', 'المعرّف في الرابط', 'text', true],
    ['icon', 'الأيقونة', 'icon:categories'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  menu_items: [
    ['category_id', 'القسم', 'category', true],
    ['name_ar', 'الاسم بالعربية', 'text', true],
    ['name_en', 'الاسم بالإنجليزية', 'text'],
    ['description_ar', 'الوصف بالعربية', 'textarea'],
    ['description_en', 'الوصف بالإنجليزية', 'textarea'],
    ['is_priced', 'له سعر ثابت', 'bool'],
    ['price_minor', 'السعر', 'money'],
    ['old_price_minor', 'السعر قبل الخصم', 'money'],
    ['image_url', 'الصورة', 'image'],
    ['badge_ar', 'شارة (عربي)', 'text'],
    ['badge_en', 'شارة (إنجليزي)', 'text'],
    ['is_featured', 'ضمن الأكثر طلبًا', 'bool'],
    ['is_available', 'متاح', 'bool'],
    ['display_order', 'الترتيب', 'number'],
  ],
  variants: [
    ['menu_item_id', 'الصنف', 'item', true],
    ['name_ar', 'الحجم بالعربية', 'text', true],
    ['name_en', 'الحجم بالإنجليزية', 'text'],
    ['price_minor', 'السعر', 'money', true],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  addons: [
    ['menu_item_id', 'الصنف', 'item', true],
    ['name_ar', 'الإضافة بالعربية', 'text', true],
    ['name_en', 'الإضافة بالإنجليزية', 'text'],
    ['price_minor', 'سعر الإضافة', 'money'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  offers: [
    ['title_ar', 'العنوان بالعربية', 'text', true],
    ['title_en', 'العنوان بالإنجليزية', 'text'],
    ['description_ar', 'الوصف بالعربية', 'textarea'],
    ['description_en', 'الوصف بالإنجليزية', 'textarea'],
    ['is_priced', 'له سعر رقمي', 'bool'],
    ['price_minor', 'السعر', 'money'],
    ['price_text_ar', 'نص السعر (مثل: ٢ بسعر ١)', 'text'],
    ['price_text_en', 'نص السعر بالإنجليزية', 'text'],
    ['old_price_text_ar', 'السعر قبل العرض', 'text'],
    ['image_url', 'الصورة', 'image'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  services: [
    ['title_ar', 'الخدمة بالعربية', 'text', true],
    ['title_en', 'الخدمة بالإنجليزية', 'text'],
    ['description_ar', 'الوصف بالعربية', 'textarea'],
    ['description_en', 'الوصف بالإنجليزية', 'textarea'],
    ['icon', 'الأيقونة', 'icon:services'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  testimonials: [
    ['customer_name', 'اسم الضيف', 'text', true],
    ['review_ar', 'الرأي بالعربية', 'textarea'],
    ['review_en', 'الرأي بالإنجليزية', 'textarea'],
    ['rating', 'التقييم (1-5)', 'number'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  faqs: [
    ['question_ar', 'السؤال بالعربية', 'text', true],
    ['question_en', 'السؤال بالإنجليزية', 'text'],
    ['answer_ar', 'الجواب بالعربية', 'textarea'],
    ['answer_en', 'الجواب بالإنجليزية', 'textarea'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  hero_stats: [
    ['title_ar', 'النص بالعربية', 'text', true],
    ['title_en', 'النص بالإنجليزية', 'text'],
    ['icon', 'الأيقونة', 'icon:hero_stats'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
  social_posts: [
    ['title', 'العنوان', 'text'],
    ['image_url', 'الصورة', 'image'],
    ['post_url', 'رابط المنشور', 'text'],
    ['display_order', 'الترتيب', 'number'],
    ['is_active', 'ظاهر', 'bool'],
  ],
};

const SECTION_LABEL = {
  categories: 'الأقسام', menu_items: 'الأصناف', variants: 'الأحجام', addons: 'الإضافات',
  offers: 'العروض', services: 'الخدمات', testimonials: 'آراء الضيوف', faqs: 'الأسئلة',
  hero_stats: 'أرقام الواجهة', social_posts: 'منشورات التواصل',
};

async function refreshMenuData() {
  const [categories, items] = await Promise.all([
    api('/api/content/categories'),
    api('/api/content/menu_items'),
  ]);
  state.categories = categories.rows;
  state.items = items.rows;
}

async function loadMenu() {
  await refreshMenuData();
  const [variants, addons] = await Promise.all([
    api('/api/content/variants'),
    api('/api/content/addons'),
  ]);

  $('categories-list').replaceChildren(table(
    ['الاسم', 'الرابط', 'الترتيب', 'ظاهر', ''],
    state.categories.map((row) => [
      row.name_ar, row.slug, row.display_order, Number(row.is_active) ? 'نعم' : 'لا',
      editButton('categories', row),
    ]),
    'لا أقسام بعد. ابدأ بإضافة قسم.',
  ));

  const byItem = (rows) => {
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.menu_item_id)) map.set(row.menu_item_id, []);
      map.get(row.menu_item_id).push(row);
    }
    return map;
  };
  const variantMap = byItem(variants.rows);
  const addonMap = byItem(addons.rows);
  const categoryName = new Map(state.categories.map((row) => [row.id, row.name_ar]));

  $('items-list').replaceChildren(table(
    ['الصنف', 'القسم', 'السعر', 'الأحجام', 'الإضافات', 'متاح', ''],
    state.items.map((row) => [
      row.name_ar,
      categoryName.get(row.category_id) || '—',
      Number(row.is_priced) ? money(row.price_minor) : 'حسب الطلب',
      subRowButton('variants', row, variantMap.get(row.id) || []),
      subRowButton('addons', row, addonMap.get(row.id) || []),
      Number(row.is_available) ? 'نعم' : 'لا',
      editButton('menu_items', row),
    ]),
    'لا أصناف بعد.',
  ));
}

const editButton = (section, row) => el('button', {
  className: 'btn btn-small', type: 'button', textContent: 'تحرير',
  onclick: () => openEditor(section, row),
});

function subRowButton(section, item, rows) {
  const label = rows.length ? rows.map((row) => row.name_ar).join('، ') : '+ إضافة';
  return el('button', {
    className: 'btn btn-small', type: 'button', textContent: label,
    onclick: () => {
      if (!rows.length) return openEditor(section, { menu_item_id: item.id });
      return openEditor(section, rows[0], rows, item.id);
    },
  });
}

async function loadContent() {
  const sections = ['offers', 'services', 'testimonials', 'faqs', 'hero_stats', 'social_posts'];
  const results = await Promise.all(sections.map((section) => api(`/api/content/${section}`)));
  $('content-sections').replaceChildren(...sections.map((section, index) => {
    const rows = results[index].rows;
    const titleField = FIELDS[section][0][0];
    return el('div', { className: 'block' }, [
      el('div', { className: 'block-head' }, [
        el('h2', { textContent: SECTION_LABEL[section] }),
        el('button', {
          className: 'btn btn-small btn-solid', type: 'button', textContent: '+ إضافة',
          onclick: () => openEditor(section, {}),
        }),
      ]),
      table(
        ['العنوان', 'الترتيب', 'ظاهر', ''],
        rows.map((row) => [
          row[titleField] || '—', row.display_order,
          Number(row.is_active) ? 'نعم' : 'لا', editButton(section, row),
        ]),
        'لا عناصر بعد.',
      ),
    ]);
  }));
}

document.querySelectorAll('[data-new]').forEach((button) => {
  button.addEventListener('click', () => openEditor(button.dataset.new, {}));
});

/* ==================== نافذة التحرير ==================== */

let editorContext = null;

function openEditor(section, row, siblings = null, parentId = null) {
  editorContext = { section, id: row.id || '', siblings, parentId };
  $('editor-title').textContent = `${SECTION_LABEL[section]} — ${row.id ? 'تحرير' : 'جديد'}`;
  $('editor-msg').textContent = '';
  $('editor-delete').hidden = !row.id;

  const fields = FIELDS[section].map(([name, label, type, required]) =>
    fieldNode(name, label, type, row[name], required));

  // الأحجام والإضافات تُدار في نافذة الصنف نفسه، فنعرض إخوته للتنقل بينها.
  const nav = siblings && siblings.length > 1
    ? el('div', { className: 'chips', style: 'margin-bottom:1rem' }, siblings.map((sibling) => el('button', {
      className: `chip${sibling.id === row.id ? ' chip-on' : ''}`, type: 'button',
      textContent: sibling.name_ar,
      onclick: () => openEditor(section, sibling, siblings, parentId),
    })).concat([el('button', {
      className: 'chip', type: 'button', textContent: '+ جديد',
      onclick: () => openEditor(section, { menu_item_id: parentId }, siblings, parentId),
    })]))
    : null;

  $('editor-fields').replaceChildren(...(nav ? [nav] : []), ...fields);
  $('editor').showModal();
}

function fieldNode(name, label, type, value, required) {
  const id = `f-${name}`;
  const wrap = el('div', { className: 'field' });

  if (type === 'bool') {
    wrap.className = 'field field-inline';
    wrap.append(
      el('input', { id, type: 'checkbox', checked: Number(value) === 1, dataset: { name, type } }),
      el('label', { htmlFor: id, textContent: label }),
    );
    return wrap;
  }

  wrap.append(el('label', { htmlFor: id, textContent: label }));

  if (type === 'textarea') {
    wrap.append(el('textarea', { id, value: value ?? '', required: Boolean(required), dataset: { name, type } }));
    return wrap;
  }
  if (type === 'category' || type === 'item') {
    const options = (type === 'category' ? state.categories : state.items)
      .map((row) => el('option', { value: row.id, textContent: row.name_ar, selected: row.id === value }));
    wrap.append(el('select', { id, required: Boolean(required), dataset: { name, type } }, options));
    return wrap;
  }
  if (type.startsWith('font:')) {
    const slot = type.slice('font:'.length);
    const known = state.meta?.fonts?.[slot] || [];
    const options = known.map(([key, fontLabel]) => el('option', { value: key, textContent: fontLabel, selected: key === value }));
    wrap.append(el('select', { id, dataset: { name, type: 'text' } }, options));
    return wrap;
  }
  if (type.startsWith('icon:')) {
    // أيقونة من قائمة لا نصّ حر — نفس قاعدة الخط: القيمة معنى يترجمه الخادم
    // إلى أيقونة فعلية، لا اسم مكتبة يخطئه من لا يعرفها.
    const section = type.slice('icon:'.length);
    const known = state.meta?.icons?.[section] || [];
    const options = [el('option', { value: '', textContent: '— بلا أيقونة —', selected: !value })]
      .concat(known.map(([key, iconLabel]) => el('option', { value: key, textContent: iconLabel, selected: key === value })));
    wrap.append(el('select', { id, dataset: { name, type: 'text' } }, options));
    return wrap;
  }
  if (type === 'image') {
    const preview = el('img', { className: 'thumb', alt: '', src: value || '', hidden: !value });
    const hidden = el('input', { id, type: 'hidden', value: value ?? '', dataset: { name, type: 'text' } });
    const picker = el('input', { type: 'file', accept: 'image/*' });
    picker.addEventListener('change', async () => {
      const file = picker.files[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        hidden.value = url;
        preview.src = url;
        preview.hidden = false;
      } catch (failure) {
        $('editor-msg').className = 'msg error';
        $('editor-msg').textContent = failure.message;
      }
    });
    wrap.append(el('div', { className: 'upload-row' }, [preview, picker]), hidden);
    return wrap;
  }

  const isMoney = type === 'money';
  wrap.append(el('input', {
    id,
    type: type === 'number' || isMoney ? 'number' : 'text',
    step: isMoney ? '0.01' : '1',
    // المبالغ تُخزَّن أعدادًا صحيحة وتُعرض بالكسر. التحويل في مكان واحد
    // هنا وفي القراءة، فلا تتسرب قسمة على مئة إلى بقية الشيفرة.
    value: isMoney ? (Number(value || 0) / 100).toFixed(2) : (value ?? ''),
    required: Boolean(required),
    dataset: { name, type },
  }));
  return wrap;
}

function collectEditor() {
  const payload = {};
  for (const node of $('editor-fields').querySelectorAll('[data-name]')) {
    const { name, type } = node.dataset;
    if (type === 'bool') payload[name] = node.checked ? 1 : 0;
    else if (type === 'money') payload[name] = Math.round(Number(node.value || 0) * 100);
    else if (type === 'number') payload[name] = Number(node.value || 0);
    else payload[name] = node.value;
  }
  return payload;
}

$('editor-save').addEventListener('click', async () => {
  const { section, id } = editorContext;
  const message = $('editor-msg');
  message.textContent = '';
  try {
    const path = id ? `/api/content/${section}/${encodeURIComponent(id)}` : `/api/content/${section}`;
    await post(path, collectEditor());
    $('editor').close();
    toast('حُفظ.');
    await reloadAfterEdit(section);
  } catch (failure) {
    message.className = 'msg error';
    message.textContent = failure.message;
  }
});

$('editor-delete').addEventListener('click', async () => {
  const { section, id } = editorContext;
  if (!id) return;
  const message = $('editor-msg');
  if (message.dataset.confirm !== id) {
    // تأكيد داخل النافذة بدل `confirm()`: الأخير يُحجب أحيانًا في المتصفحات
    // ويترك الزر بلا استجابة ظاهرة.
    message.dataset.confirm = id;
    message.className = 'msg error';
    message.textContent = 'اضغط «حذف» مرة أخرى للتأكيد.';
    return;
  }
  try {
    await api(`/api/content/${section}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    $('editor').close();
    message.dataset.confirm = '';
    toast('حُذف.');
    await reloadAfterEdit(section);
  } catch (failure) {
    message.className = 'msg error';
    message.textContent = failure.message;
  }
});

const reloadAfterEdit = (section) =>
  (['categories', 'menu_items', 'variants', 'addons'].includes(section) ? loadMenu() : loadContent());

// أزرار الإغلاق أزرار عادية لا أزرار إرسال داخل `method="dialog"`: في لوحة
// أثر منع مستمعُ الإرسال الإغلاقَ فبقيت النوافذ عالقة حتى تحديث الصفحة.
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});

/* ==================== الصور ==================== */

/**
 * الضغط في المتصفح قبل الرفع.
 *
 * صورة هاتف بـ4MB تصل بنحو 150KB، والفرق يظهر في سرعة موقع يفتحه زبون على
 * شبكة هاتف. الخادم يتحقق من التوقيع بنفسه، فهذا تحسين لا حماية.
 */
async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  // متصفح لا يدعم WebP يعيد PNG بصمت، وهو أكبر لكنه يعمل. الأصل يُرفع كما
  // هو فقط إن فشل التحويل كله.
  return blob || file;
}

async function uploadImage(file) {
  const blob = await compressImage(file);
  const result = await api('/api/upload', { method: 'POST', body: blob });
  return result.url;
}

/* ==================== الهوية ==================== */

const IDENTITY_GROUPS = [
  ['الشعار والنصوص', [
    ['tagline_ar', 'الشعار النصي (عربي)', 'text'],
    ['tagline_en', 'الشعار النصي (إنجليزي)', 'text'],
    ['hero_title_ar', 'عنوان الواجهة (عربي)', 'text'],
    ['hero_title_en', 'عنوان الواجهة (إنجليزي)', 'text'],
    ['hero_text_ar', 'نص الواجهة (عربي)', 'textarea'],
    ['hero_text_en', 'نص الواجهة (إنجليزي)', 'textarea'],
    ['about_text_ar', 'من نحن (عربي)', 'textarea'],
    ['about_text_en', 'من نحن (إنجليزي)', 'textarea'],
  ]],
  ['الصور', [
    ['logo_url', 'الشعار', 'image'],
    ['hero_image_url', 'صورة الواجهة', 'image'],
    ['og_image_url', 'صورة المشاركة', 'image'],
  ]],
  ['الألوان والخطوط', [
    ['primary_color', 'اللون الأساسي', 'color'],
    ['gold_color', 'اللون الثانوي', 'color'],
    ['background_color', 'لون الخلفية', 'color'],
    ['surface_color', 'لون البطاقات', 'color'],
    ['theme_layer', 'طبقة الثيم الإضافية', 'themelayer'],
    ['arabic_font', 'الخط العربي (نص الجسم)', 'font:arabic'],
    ['arabic_display_font', 'الخط العربي (العناوين)', 'font:arabic_display'],
    ['latin_font', 'الخط اللاتيني', 'font:latin'],
    ['display_font', 'خط العناوين البارزة', 'font:display'],
  ]],
  ['الاتصال', [
    ['whatsapp_number', 'رقم واتساب (أرقام فقط مع رمز الدولة)', 'text'],
    ['phone', 'الهاتف', 'text'],
    ['email', 'البريد', 'text'],
    ['address_ar', 'العنوان (عربي)', 'text'],
    ['address_en', 'العنوان (إنجليزي)', 'text'],
    ['hours_ar', 'ساعات العمل (عربي)', 'text'],
    ['hours_en', 'ساعات العمل (إنجليزي)', 'text'],
    ['instagram_url', 'إنستغرام', 'text'],
    ['facebook_url', 'فيسبوك', 'text'],
  ]],
  ['أقسام الصفحة', [
    ['show_about', 'من نحن', 'bool'],
    ['show_categories', 'الأقسام', 'bool'],
    ['show_featured', 'الأكثر طلبًا', 'bool'],
    ['show_offers', 'العروض', 'bool'],
    ['show_services', 'الخدمات', 'bool'],
    ['show_reviews', 'الآراء', 'bool'],
    ['show_reservation', 'الحجز', 'bool'],
    ['show_faq', 'الأسئلة', 'bool'],
    ['show_social', 'التواصل', 'bool'],
  ]],
  ['قواعد الحجز', [
    ['reservation_open_time', 'أول موعد (HH:MM)', 'text'],
    ['reservation_close_time', 'آخر موعد (HH:MM)', 'text'],
    ['reservation_slot_minutes', 'طول الفترة بالدقائق', 'number'],
    ['max_reservations_per_slot', 'حجوزات لكل فترة', 'number'],
    ['max_reservation_days_ahead', 'أقصى حجز مقدمًا (أيام)', 'number'],
  ]],
  ['البحث والتذييل', [
    ['seo_title_ar', 'عنوان الصفحة (عربي)', 'text'],
    ['seo_description_ar', 'وصف الصفحة (عربي)', 'textarea'],
    ['footer_text_ar', 'نص التذييل (عربي)', 'text'],
    ['order_code_prefix', 'بادئة رقم الطلب', 'text'],
    ['currency', 'رمز العملة', 'text'],
  ]],
];

async function loadIdentity() {
  const info = await api('/api/me');
  state.settings = info.settings;
  $('identity-form').replaceChildren(...IDENTITY_GROUPS.map(([title, fields]) =>
    el('div', { className: 'block' }, [
      el('h3', { textContent: title }),
      el('div', { className: 'fields' }, fields.map(([name, label, type]) =>
        identityField(name, label, type, state.settings[name]))),
    ])));
}

function identityField(name, label, type, value) {
  if (type === 'color') {
    const wrap = el('div', { className: 'field' }, [el('label', { htmlFor: `s-${name}`, textContent: label })]);
    wrap.append(el('input', {
      id: `s-${name}`, type: 'color', value: /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#000000',
      dataset: { name, type: 'text' },
    }));
    return wrap;
  }
  if (type === 'themelayer') {
    // طبقة واحدة موجودة فعلًا فوق التصميم الأساسي. غيرها يشير إلى ملف لم
    // يُبنَ بعد، فلا تُعرض كخيار حتى لا تُختار قيمة يرفضها الخادم.
    const wrap = el('div', { className: 'field' }, [el('label', { htmlFor: `s-${name}`, textContent: label })]);
    wrap.append(el('select', { id: `s-${name}`, dataset: { name, type: 'text' } }, [
      el('option', { value: '', textContent: 'بلا طبقة إضافية', selected: !value }),
      el('option', { value: 'luxury', textContent: 'فاخرة (حدود وتدرّجات ذهبية)', selected: value === 'luxury' }),
    ]));
    return wrap;
  }
  return fieldNode(`s-${name}`, label, type, value, false);
}

$('identity-save').addEventListener('click', async () => {
  const payload = {};
  for (const node of $('identity-form').querySelectorAll('[data-name]')) {
    const { name, type } = node.dataset;
    const key = name.startsWith('s-') ? name.slice(2) : name;
    if (type === 'bool') payload[key] = node.checked ? 1 : 0;
    else if (type === 'number') payload[key] = Number(node.value || 0);
    else payload[key] = node.value;
  }
  try {
    await post('/api/settings', payload);
    toast('حُفظت الهوية. افتح الموقع العام لتراها.');
  } catch (failure) {
    toast(failure.message, 'error');
  }
});

/* ==================== الحسابات ==================== */

const ROLE_LABEL = { owner: 'المالك', manager: 'مدير', cashier: 'كاشير' };

async function loadUsers() {
  const data = await api('/api/users');
  $('users-list').replaceChildren(table(
    ['المستخدم', 'الاسم', 'الدور', 'الحالة', ''],
    data.users.map((row) => [
      row.username, row.display_name, ROLE_LABEL[row.role] || row.role,
      Number(row.is_active) ? 'مفعّل' : 'معطّل',
      el('div', { className: 'actions' }, [
        el('button', {
          className: 'btn btn-small', type: 'button',
          textContent: Number(row.is_active) ? 'تعطيل' : 'تفعيل',
          disabled: row.role === 'owner',
          onclick: () => patchUser(row.id, { is_active: !Number(row.is_active) }),
        }),
        el('button', {
          className: 'btn btn-small', type: 'button', textContent: 'كلمة مرور جديدة',
          onclick: () => promptPassword(row),
        }),
      ]),
    ]),
    'لا حسابات بعد.',
  ));
}

async function patchUser(id, patch) {
  try {
    await api(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    toast('حُدّث الحساب.');
    await loadUsers();
  } catch (failure) {
    toast(failure.message, 'error');
  }
}

function promptPassword(user) {
  editorContext = { section: 'users', id: user.id };
  $('editor-title').textContent = `كلمة مرور جديدة — ${user.username}`;
  $('editor-msg').textContent = '';
  $('editor-delete').hidden = true;
  const input = el('input', { id: 'new-pass', type: 'password', minLength: 8, autocomplete: 'new-password' });
  $('editor-fields').replaceChildren(el('div', { className: 'field' }, [
    el('label', { htmlFor: 'new-pass', textContent: 'كلمة المرور (8 محارف فأكثر)' }), input,
  ]));
  $('editor-save').onclick = async () => {
    try {
      await api(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', body: JSON.stringify({ password: input.value }),
      });
      $('editor').close();
      restoreEditorSave();
      toast('غُيّرت كلمة المرور. خرجت أجهزة صاحب الحساب.');
    } catch (failure) {
      $('editor-msg').className = 'msg error';
      $('editor-msg').textContent = failure.message;
    }
  };
  $('editor').showModal();
}

$('user-new').addEventListener('click', () => {
  $('editor-title').textContent = 'حساب جديد';
  $('editor-msg').textContent = '';
  $('editor-delete').hidden = true;
  const username = el('input', { id: 'u-name', autocomplete: 'off', spellcheck: false });
  const display = el('input', { id: 'u-display' });
  const password = el('input', { id: 'u-pass', type: 'password', autocomplete: 'new-password' });
  const role = el('select', { id: 'u-role' }, [
    el('option', { value: 'cashier', textContent: 'كاشير' }),
    el('option', { value: 'manager', textContent: 'مدير' }),
  ]);
  $('editor-fields').replaceChildren(
    el('div', { className: 'field' }, [el('label', { htmlFor: 'u-name', textContent: 'اسم المستخدم' }), username]),
    el('div', { className: 'field' }, [el('label', { htmlFor: 'u-display', textContent: 'الاسم المعروض' }), display]),
    el('div', { className: 'field' }, [el('label', { htmlFor: 'u-pass', textContent: 'كلمة المرور' }), password]),
    el('div', { className: 'field' }, [el('label', { htmlFor: 'u-role', textContent: 'الدور' }), role]),
  );
  $('editor-save').onclick = async () => {
    try {
      await post('/api/users', {
        username: username.value.trim(), display_name: display.value.trim(),
        password: password.value, role: role.value,
      });
      $('editor').close();
      restoreEditorSave();
      toast('أُنشئ الحساب.');
      await loadUsers();
    } catch (failure) {
      $('editor-msg').className = 'msg error';
      $('editor-msg').textContent = failure.message;
    }
  };
  $('editor').showModal();
});

/** يعيد زر الحفظ إلى سلوكه العام بعد استعمال النافذة لغرض خاص. */
function restoreEditorSave() {
  $('editor-save').onclick = null;
}

$('editor').addEventListener('close', restoreEditorSave);

/* ==================== حسابي ==================== */

$('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('account-msg');
  message.textContent = '';
  try {
    await post('/api/account/credentials', {
      current_password: $('account-current').value,
      new_username: $('account-username').value.trim(),
      new_password: $('account-password').value,
    });
    event.target.reset();
    message.className = 'msg ok';
    message.textContent = 'حُفظت بياناتك. بقية أجهزتك خرجت من الجلسة.';
  } catch (failure) {
    message.className = 'msg error';
    message.textContent = failure.message;
  }
});

/* ==================== البداية ==================== */

/**
 * زر «الإدارة» في موقع المطعم يصل بـ`#r={slug}`.
 *
 * جزء العنوان لا معامل استعلام: لا يُرسل إلى الخادم ولا يدخل سجلات الوسطاء.
 * ويُمسح فور قراءته فلا يبقى في شريط العنوان ولا في سجل التصفح، ولا يُنسخ
 * مع الرابط إن شاركه أحد. يملأ خانة المطعم وحدها ثم يضع المؤشر على اسم
 * المستخدم — لا اسم ولا كلمة مرور يأتيان من الرابط بحال.
 */
(function prefillFromLink() {
  const slug = /[#&]r=([^&]+)/.exec(location.hash || '')?.[1];
  if (!slug) return;
  history.replaceState(null, '', location.pathname + location.search);
  const field = $('login-restaurant');
  if (!field) return;
  try { field.value = decodeURIComponent(slug); } catch { field.value = slug; }
  $('login-username')?.focus();
}());

bootstrap().catch(() => signOut(''));
