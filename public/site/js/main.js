(() => {
    'use strict';

    const body = document.body;
    const lang = body.dataset.lang || 'ar';
    const currency = body.dataset.currency || '₪';
    const storageKey = 'restaurant-cart';

    const safeJSON = (value, fallback) => {
        try { return JSON.parse(value); } catch (_) { return fallback; }
    };

    const parseJSONArray = value => {
        const parsed = safeJSON(value, []);
        return Array.isArray(parsed) ? parsed : [];
    };

    const parsePrice = value => {
        const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
        const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
        let normalized = String(value ?? '')
            .replace(/[٠-٩]/g, digit => arabicDigits.indexOf(digit))
            .replace(/[۰-۹]/g, digit => persianDigits.indexOf(digit))
            .replace(/٬/g, '')
            .replace(/٫/g, '.')
            .replace(/[^0-9,.-]/g, '');
        if (normalized.includes(',')) {
            if (normalized.includes('.')) {
                normalized = normalized.replace(/,/g, '');
            } else {
                const commaParts = normalized.split(',');
                normalized = commaParts.length === 2 && commaParts[1].length <= 2
                    ? commaParts.join('.')
                    : commaParts.join('');
            }
        }
        const number = Number(normalized);
        return Number.isFinite(number) ? Math.max(0, number) : 0;
    };

    let storedValue = null;
    try { storedValue = window.localStorage.getItem(storageKey); } catch (_) { storedValue = null; }
    const storedCart = safeJSON(storedValue, []);
    let cart = Array.isArray(storedCart) ? storedCart
        .filter(item => item && typeof item === 'object')
        .map(item => {
            const id = String(item.id || '');
            const variantId = /^\d+$/.test(String(item.variantId ?? '')) ? String(item.variantId) : null;
            const addonIds = (Array.isArray(item.addonIds) ? item.addonIds : [])
                .map(String).filter(addonId => /^\d+$/.test(addonId)).sort();
            return {
                id,
                cartKey: `${id}:${variantId || ''}:${addonIds.join(',')}`,
                nameAr: String(item.nameAr || ''),
                nameEn: String(item.nameEn || ''),
                price: parsePrice(item.price),
                priceTextAr: String(item.priceTextAr || ''),
                priceTextEn: String(item.priceTextEn || ''),
                priced: item.priced !== false,
                variantId,
                addonIds,
                qty: Number.isFinite(Number(item.qty)) ? Math.min(99, Math.max(1, Math.trunc(Number(item.qty)))) : 1,
            };
        })
        .filter(item => item.id && (item.nameAr || item.nameEn)) : [];

    const saveCart = () => {
        try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch (_) { /* Storage can be unavailable. */ }
        renderCart();
    };

    const formatPrice = value => {
        const number = parsePrice(value);
        return `${number.toFixed(number % 1 ? 2 : 0)} ${currency}`;
    };

    const itemName = item => lang === 'ar' ? item.nameAr : item.nameEn;
    const itemPriceLabel = item => {
        if (item.priced) return formatPrice(item.price);
        return lang === 'ar' ? item.priceTextAr : (item.priceTextEn || item.priceTextAr);
    };

    // Looked up lazily so the cart keeps working even if a browser extension
    // (translate, dark mode, ...) replaces parts of the DOM after load.
    let drawer = document.querySelector('.order-drawer');
    const getDrawer = () => {
        if (!drawer || !drawer.isConnected) drawer = document.querySelector('.order-drawer');
        return drawer;
    };
    const cartFeedback = document.getElementById('cart-feedback');
    const clearCartButton = document.getElementById('clear-cart');
    const fulfillmentInputs = document.querySelectorAll('input[name="fulfillment"]');
    const deliveryFields = document.getElementById('delivery-fields');
    const orderName = document.getElementById('order-name');
    const orderPhone = document.getElementById('order-phone');
    const orderAddress = document.getElementById('order-address');
    let lastFocusedElement = null;
    let feedbackTimer = null;
    let inertBackgroundElements = [];

    const drawerFocusable = () => [...(getDrawer()?.querySelectorAll('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => !element.disabled && element.offsetParent !== null);

    const openCart = () => {
        const panel = getDrawer();
        if (!panel) return;
        setNavOpen(false);
        lastFocusedElement = document.activeElement;
        inertBackgroundElements = [...body.children].filter(element => (
            element !== panel
            && !element.hasAttribute('inert')
            && !['SCRIPT', 'STYLE'].includes(element.tagName)
        ));
        inertBackgroundElements.forEach(element => element.setAttribute('inert', ''));
        panel.hidden = false;
        panel.removeAttribute('inert');
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        body.classList.add('drawer-open');
        drawerFocusable()[0]?.focus();
    };

    const closeCart = () => {
        const panel = getDrawer();
        if (!panel) return;
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('inert', '');
        panel.hidden = true;
        body.classList.remove('drawer-open');
        inertBackgroundElements.forEach(element => element.removeAttribute('inert'));
        inertBackgroundElements = [];
        if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    };

    // Dish detail dialog — a read-only quick view opened from a menu card.
    // It copies the clicked card's own add-to-cart button dataset onto the
    // dialog's add button, so adding from the dialog runs through the exact
    // same .js-add-item handling as the card itself (see the click listener
    // below) instead of duplicating cart logic.
    let dishDialog = document.getElementById('dish-dialog');
    const getDishDialog = () => {
        if (!dishDialog || !dishDialog.isConnected) dishDialog = document.getElementById('dish-dialog');
        return dishDialog;
    };
    let dishLastFocusedElement = null;
    let dishInertBackgroundElements = [];

    const dishDialogFocusable = () => [...(getDishDialog()?.querySelectorAll('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => !element.disabled && element.offsetParent !== null);

    // Recomputes the dialog's displayed price and the add button's dataset
    // from whichever variant/addons are currently checked. Display-only:
    // the server re-validates and re-prices everything from variant_id and
    // addon_ids at checkout regardless of what is shown here.
    const recomputeDishDialogPrice = () => {
        const addButton = document.getElementById('dish-dialog-add');
        const priceEl = document.getElementById('dish-dialog-price');
        if (!addButton) return;

        const checkedVariant = document.querySelector('#dish-dialog-variant-list input[name="dish-variant"]:checked');
        const checkedAddons = [...document.querySelectorAll('#dish-dialog-addon-list input:checked')];
        const basePrice = checkedVariant ? parsePrice(checkedVariant.dataset.price) : parsePrice(addButton.dataset.basePrice);
        const addonsTotal = checkedAddons.reduce((sum, input) => sum + parsePrice(input.dataset.price), 0);
        const total = basePrice + addonsTotal;

        let nameAr = addButton.dataset.baseNameAr || '';
        let nameEn = addButton.dataset.baseNameEn || '';
        if (checkedVariant) {
            nameAr += ` (${checkedVariant.dataset.nameAr})`;
            nameEn += ` (${checkedVariant.dataset.nameEn})`;
        }
        if (checkedAddons.length) {
            nameAr += ' + ' + checkedAddons.map(input => input.dataset.nameAr).join('، ');
            nameEn += ' + ' + checkedAddons.map(input => input.dataset.nameEn).join(', ');
        }

        addButton.dataset.id = addButton.dataset.baseId || '';
        addButton.dataset.nameAr = nameAr;
        addButton.dataset.nameEn = nameEn;
        addButton.dataset.price = String(total);
        if (checkedVariant) addButton.dataset.variantId = checkedVariant.value;
        else delete addButton.dataset.variantId;
        addButton.dataset.addonIds = JSON.stringify(checkedAddons.map(input => input.value));

        const variantRequired = !document.getElementById('dish-dialog-variants')?.classList.contains('hidden');
        addButton.disabled = variantRequired && !checkedVariant;
        if (priceEl) priceEl.textContent = formatPrice(total);
    };

    const openDishDialog = card => {
        const panel = getDishDialog();
        const trigger = card?.querySelector('[data-id]');
        if (!panel || !trigger) return;

        const img = card.querySelector('.menu-image img, img');
        const dialogImg = document.getElementById('dish-dialog-img');
        if (dialogImg) {
            dialogImg.src = img?.src || '';
            dialogImg.alt = img?.alt || '';
        }
        const name = lang === 'ar' ? (trigger.dataset.nameAr || trigger.dataset.nameEn) : (trigger.dataset.nameEn || trigger.dataset.nameAr);
        const desc = lang === 'ar' ? (trigger.dataset.descAr || trigger.dataset.descEn) : (trigger.dataset.descEn || trigger.dataset.descAr);
        const titleEl = document.getElementById('dish-dialog-title');
        const descEl = document.getElementById('dish-dialog-desc');
        if (titleEl) titleEl.textContent = name || '';
        if (descEl) {
            descEl.textContent = desc || '';
            descEl.classList.toggle('hidden', !desc);
        }

        const addButton = document.getElementById('dish-dialog-add');
        if (addButton) {
            ['offer', 'priceTextAr', 'priceTextEn'].forEach(key => {
                if (trigger.dataset[key] !== undefined) addButton.dataset[key] = trigger.dataset[key];
                else delete addButton.dataset[key];
            });
            addButton.dataset.baseId = trigger.dataset.id || '';
            addButton.dataset.baseNameAr = trigger.dataset.nameAr || '';
            addButton.dataset.baseNameEn = trigger.dataset.nameEn || '';
            addButton.dataset.basePrice = trigger.dataset.price || '0';
        }

        const variants = parseJSONArray(trigger.dataset.variants);
        const addons = parseJSONArray(trigger.dataset.addons);

        const variantsSection = document.getElementById('dish-dialog-variants');
        const variantList = document.getElementById('dish-dialog-variant-list');
        if (variantsSection && variantList) {
            variantsSection.classList.toggle('hidden', variants.length === 0);
            variantList.innerHTML = variants.map((variant, index) => `
                <label class="dish-dialog-option">
                    <span class="dish-dialog-option-name">${escapeHTML(lang === 'ar' ? variant.nameAr : variant.nameEn)}</span>
                    <span class="dish-dialog-option-price">${escapeHTML(formatPrice(variant.price))}</span>
                    <input type="radio" name="dish-variant" value="${escapeHTML(String(variant.id))}" data-price="${escapeHTML(variant.price)}" data-name-ar="${escapeHTML(variant.nameAr)}" data-name-en="${escapeHTML(variant.nameEn)}"${index === 0 ? ' checked' : ''}>
                </label>
            `).join('');
        }

        const addonsSection = document.getElementById('dish-dialog-addons');
        const addonList = document.getElementById('dish-dialog-addon-list');
        if (addonsSection && addonList) {
            addonsSection.classList.toggle('hidden', addons.length === 0);
            addonList.innerHTML = addons.map(addon => `
                <label class="dish-dialog-option">
                    <span class="dish-dialog-option-name">${escapeHTML(lang === 'ar' ? addon.nameAr : addon.nameEn)}</span>
                    <span class="dish-dialog-option-price">+${escapeHTML(formatPrice(addon.price))}</span>
                    <input type="checkbox" value="${escapeHTML(String(addon.id))}" data-price="${escapeHTML(addon.price)}" data-name-ar="${escapeHTML(addon.nameAr)}" data-name-en="${escapeHTML(addon.nameEn)}">
                </label>
            `).join('');
        }

        recomputeDishDialogPrice();

        setNavOpen(false);
        dishLastFocusedElement = document.activeElement;
        dishInertBackgroundElements = [...body.children].filter(element => (
            element !== panel
            && !element.hasAttribute('inert')
            && !['SCRIPT', 'STYLE'].includes(element.tagName)
        ));
        dishInertBackgroundElements.forEach(element => element.setAttribute('inert', ''));
        panel.hidden = false;
        panel.removeAttribute('inert');
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        body.classList.add('dish-dialog-open');
        dishDialogFocusable()[0]?.focus();
    };

    document.addEventListener('change', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('#dish-dialog-variant-list, #dish-dialog-addon-list')) {
            recomputeDishDialogPrice();
        }
    });

    const closeDishDialog = () => {
        const panel = getDishDialog();
        if (!panel) return;
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('inert', '');
        panel.hidden = true;
        body.classList.remove('dish-dialog-open');
        dishInertBackgroundElements.forEach(element => element.removeAttribute('inert'));
        dishInertBackgroundElements = [];
        if (dishLastFocusedElement instanceof HTMLElement) dishLastFocusedElement.focus();
    };

    const showCartFeedback = message => {
        if (!cartFeedback) return;
        cartFeedback.textContent = message;
        cartFeedback.classList.add('show');
        window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(() => cartFeedback.classList.remove('show'), 3200);
    };

    const pulseCartButtons = () => {
        document.querySelectorAll('.header-whatsapp, .floating-whatsapp').forEach(button => {
            button.classList.remove('cart-pulse');
            void button.offsetWidth; // Restart the animation on repeated adds.
            button.classList.add('cart-pulse');
            window.setTimeout(() => button.classList.remove('cart-pulse'), 750);
        });
    };

    const selectedFulfillment = () => document.querySelector('input[name="fulfillment"]:checked')?.value || 'pickup';

    const updateDeliveryFields = () => {
        const isDelivery = selectedFulfillment() === 'delivery';
        deliveryFields?.classList.toggle('hidden', !isDelivery);
        [orderName, orderPhone, orderAddress].forEach(field => {
            if (field) field.required = isDelivery;
        });
    };

    fulfillmentInputs.forEach(input => input.addEventListener('change', () => {
        updateDeliveryFields();
        if (selectedFulfillment() === 'delivery') orderName?.focus();
    }));

    const renderCart = () => {
        const cartItems = document.getElementById('cart-items');
        const cartEmpty = document.getElementById('cart-empty');
        const cartTotal = document.getElementById('cart-total');
        if (!cartItems || !cartEmpty || !cartTotal) return;
        const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
        const total = cart.reduce((sum, item) => sum + (item.priced ? Number(item.price) * item.qty : 0), 0);
        const hasUnpricedItems = cart.some(item => !item.priced);
        document.querySelectorAll('.cart-count, .floating-count').forEach(counter => counter.textContent = totalQty);

        const stickyCartBar = document.getElementById('sticky-cart-bar');
        const stickyCartName = document.getElementById('sticky-cart-name');
        const stickyCartCount = document.getElementById('sticky-cart-count');
        const stickyCartTotal = document.getElementById('sticky-cart-total');
        if (stickyCartBar) stickyCartBar.hidden = cart.length === 0;
        if (stickyCartName) {
            // Most recently touched items first, so the bar reflects what the
            // customer just did rather than a generic "your order" label.
            const recentItems = [...cart].reverse().slice(0, 3);
            const namesText = recentItems.map(itemName).join(lang === 'ar' ? '، ' : ', ');
            const olderCount = cart.length - recentItems.length;
            stickyCartName.textContent = recentItems.length
                ? (olderCount > 0
                    ? `${namesText} ${lang === 'ar' ? `+${olderCount} أخرى` : `+${olderCount} more`}`
                    : namesText)
                : '';
        }
        if (stickyCartCount) stickyCartCount.textContent = totalQty;
        if (stickyCartTotal) {
            stickyCartTotal.textContent = hasUnpricedItems && total === 0
                ? (lang === 'ar' ? 'يُحدد عند التأكيد' : 'Confirmed on contact')
                : formatPrice(total);
        }
        const bottomNavBadge = document.getElementById('bottom-nav-cart-count');
        if (bottomNavBadge) {
            bottomNavBadge.textContent = totalQty;
            bottomNavBadge.hidden = totalQty === 0;
        }
        body.classList.toggle('has-cart-items', cart.length > 0);

        cartTotal.textContent = hasUnpricedItems
            ? (total > 0 ? `${formatPrice(total)} + ${lang === 'ar' ? 'عرض يُؤكد سعره' : 'offer price to confirm'}` : (lang === 'ar' ? 'يُحدد عند التأكيد' : 'Confirmed on contact'))
            : formatPrice(total);
        cartEmpty.classList.toggle('hidden', cart.length > 0);
        clearCartButton?.classList.toggle('hidden', cart.length === 0);

        cartItems.innerHTML = cart.map(item => `
            <article class="cart-item" data-cart-id="${escapeHTML(item.cartKey)}">
                <div>
                    <h3>${escapeHTML(itemName(item))}</h3>
                    <span class="cart-item-price">${escapeHTML(itemPriceLabel(item))}</span>
                </div>
                <div class="qty-control">
                    <button type="button" data-cart-action="decrease" aria-label="${lang === 'ar' ? 'تقليل الكمية' : 'Decrease quantity'}">−</button>
                    <strong>${item.qty}</strong>
                    <button type="button" data-cart-action="increase" aria-label="${lang === 'ar' ? 'زيادة الكمية' : 'Increase quantity'}">+</button>
                    <button type="button" class="remove-item" data-cart-action="remove" aria-label="${lang === 'ar' ? 'حذف الطبق' : 'Remove item'}">×</button>
                </div>
            </article>
        `).join('');

        renderUpsell();
    };

    // Complementary categories suggested from the cart drawer once it has at
    // least one item. Read straight from the page's own menu cards (already
    // rendered, including ones hidden by filters/pagination) rather than a
    // second network request, so this stays purely a display feature.
    const UPSELL_ICONS = new Set(['salad', 'drink', 'dessert']);
    // "Meals" carries the salad icon in Adana's own category data despite
    // being full dishes, not a side — excluded by slug since icon alone
    // can't tell the two apart.
    const UPSELL_EXCLUDED_CATEGORIES = new Set(['meals']);

    const renderUpsell = () => {
        const section = document.getElementById('drawer-upsell');
        const list = document.getElementById('drawer-upsell-items');
        if (!section || !list) return;

        const inCart = new Set(cart.map(item => item.id));
        const seen = new Set();
        const suggestions = [];
        if (cart.length) {
            document.querySelectorAll('.menu-card[data-icon]').forEach(card => {
                if (suggestions.length >= 3 || !UPSELL_ICONS.has(card.dataset.icon)) return;
                if (UPSELL_EXCLUDED_CATEGORIES.has(card.dataset.category)) return;
                const button = card.querySelector('.js-add-item[data-id]');
                const id = String(button?.dataset.id || '');
                if (!id || inCart.has(id) || seen.has(id)) return;
                seen.add(id);
                suggestions.push(button);
            });
        }

        section.classList.toggle('hidden', suggestions.length === 0);
        list.innerHTML = suggestions.map(button => {
            const nameAr = button.dataset.nameAr || '';
            const nameEn = button.dataset.nameEn || nameAr;
            return `
            <button type="button" class="upsell-item js-add-item" data-id="${escapeHTML(button.dataset.id || '')}" data-name-ar="${escapeHTML(nameAr)}" data-name-en="${escapeHTML(nameEn)}" data-price="${escapeHTML(button.dataset.price || '')}">
                <span class="upsell-name">${escapeHTML(lang === 'ar' ? nameAr : nameEn)}</span>
                <span class="upsell-price">+${escapeHTML(formatPrice(button.dataset.price))}</span>
            </button>`;
        }).join('');
    };

    const escapeHTML = value => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const buttonToCartItem = button => {
        const isOffer = button.dataset.offer === 'true';
        const priceTextAr = button.dataset.priceTextAr || '';
        const priceTextEn = button.dataset.priceTextEn || priceTextAr;
        const activePriceText = lang === 'ar' ? priceTextAr : priceTextEn;
        const fixedPricePattern = /^\s*[\d٠-٩۰-۹]+(?:[.,٫][\d٠-٩۰-۹]{1,2})?\s*(?:₪|ILS|شيكل)?\s*$/i;
        const offerHasFixedPrice = isOffer && fixedPricePattern.test(activePriceText) && parsePrice(activePriceText) > 0;

        const variantId = /^\d+$/.test(button.dataset.variantId || '') ? button.dataset.variantId : null;
        const addonIds = parseJSONArray(button.dataset.addonIds)
            .map(String).filter(id => /^\d+$/.test(id)).sort();

        return {
            id: String(button.dataset.id || ''),
            // Two entries for the same dish only merge when the size and
            // extras match too — otherwise they are differently-priced
            // lines and must stay apart in the cart.
            cartKey: `${button.dataset.id || ''}:${variantId || ''}:${addonIds.join(',')}`,
            nameAr: button.dataset.nameAr || '',
            nameEn: button.dataset.nameEn || '',
            price: isOffer ? (offerHasFixedPrice ? parsePrice(activePriceText) : 0) : parsePrice(button.dataset.price),
            priceTextAr,
            priceTextEn,
            priced: !isOffer || offerHasFixedPrice,
            variantId,
            addonIds,
            qty: 1,
        };
    };

    const syncCartWithPage = () => {
        const availableButtons = [...document.querySelectorAll('.js-add-item[data-id], .js-open-dish[data-id]')];
        const byId = new Map(availableButtons.map(button => [String(button.dataset.id), button]));
        cart = cart
            .filter(item => byId.has(item.id))
            .map(item => {
                const qty = Math.min(99, Math.max(1, item.qty));
                if (item.variantId || item.addonIds?.length) {
                    // Priced through the dialog at add-time — re-deriving it
                    // from the card's own button would silently drop the
                    // chosen size/extras and fall back to the base price.
                    return {...item, qty};
                }
                return {...buttonToCartItem(byId.get(item.id)), qty};
            });
    };

    // The bottom nav's search tab links to the menu page by default, but if
    // a search box already exists on the current page there is no reason to
    // navigate away from it — just bring it into view instead.
    const focusMenuSearch = () => {
        const localSearch = document.getElementById('menu-search');
        if (!localSearch) return false;
        localSearch.scrollIntoView({behavior: 'smooth', block: 'center'});
        window.setTimeout(() => localSearch.focus(), 260);
        return true;
    };

    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        if (target.closest('.js-nav-search')) {
            if (focusMenuSearch()) event.preventDefault();
            return;
        }

        const openButton = target.closest('.js-open-cart');
        if (openButton) {
            event.preventDefault();
            openCart();
            return;
        }

        if (target.closest('.js-close-cart')) {
            closeCart();
            return;
        }

        if (target.closest('.js-close-dish')) {
            closeDishDialog();
            return;
        }

        const addButton = target.closest('.js-add-item');
        if (addButton) {
            const freshItem = buttonToCartItem(addButton);
            const existing = cart.find(item => item.cartKey === freshItem.cartKey);
            if (existing) {
                Object.assign(existing, freshItem, {qty: Math.min(99, existing.qty + 1)});
            } else {
                cart.push(freshItem);
            }
            saveCart();
            addButton.classList.add('added');
            const addedName = itemName(freshItem);
            showCartFeedback(
                lang === 'ar'
                    ? `تمت إضافة ${addedName} إلى السلة`
                    : `${addedName} was added to your cart`,
            );
            navigator.vibrate?.(35);
            const addLabel = addButton.querySelector('.add-label');
            const originalLabel = addLabel?.textContent;
            if (addLabel) addLabel.textContent = lang === 'ar' ? 'تمت الإضافة' : 'Added';
            pulseCartButtons();
            setTimeout(() => {
                addButton.classList.remove('added');
                if (addLabel && originalLabel) addLabel.textContent = originalLabel;
            }, 900);
            // ATHAR: adding from the dish dialog closes it. Upstream leaves the
            // dialog open, which strands the customer on a panel whose job is
            // done and hides the cart confirmation behind it. Cards outside the
            // dialog are unaffected — closeDishDialog() is a no-op for them.
            if (addButton.closest('#dish-dialog')) closeDishDialog();
            return;
        }

        const dishCard = target.closest('.menu-card');
        if (dishCard) {
            openDishDialog(dishCard);
            return;
        }

        const cartAction = target.closest('[data-cart-action]');
        if (cartAction) {
            const row = cartAction.closest('[data-cart-id]');
            const item = cart.find(entry => entry.cartKey === row?.dataset.cartId);
            if (!item) return;
            const action = cartAction.dataset.cartAction;
            if (action === 'increase') item.qty = Math.min(99, item.qty + 1);
            if (action === 'decrease') item.qty = Math.max(1, item.qty - 1);
            if (action === 'remove') cart = cart.filter(entry => entry.cartKey !== item.cartKey);
            saveCart();
        }
    });

    clearCartButton?.addEventListener('click', () => {
        if (!cart.length) return;
        const approved = window.confirm(lang === 'ar' ? 'هل تريد مسح جميع الأصناف من الطلب؟' : 'Clear all items from the order?');
        if (!approved) return;
        cart = [];
        saveCart();
        showCartFeedback(lang === 'ar' ? 'تم مسح الطلب.' : 'Order cleared.');
    });

    // The order is priced by the server. This sends dish ids and quantities
    // only — any price held in the page or in localStorage is ignored, which
    // is what stops a customer from editing what the restaurant is owed.
    const orderEndpoint = body.dataset.orderUrl || '/order/';
    const csrfToken = () => document.querySelector('#csrf-holder input[name=csrfmiddlewaretoken]')?.value || '';

    const t = (ar, en) => (lang === 'ar' ? ar : en);

    // Opens the restaurant's own WhatsApp chat with the order number and a
    // link to the order page.
    //
    // The receipt image is deliberately not pushed through the share sheet:
    // that sheet cannot address the restaurant's chat, so whether anything
    // arrived depended on the customer picking the right conversation. The
    // link always lands in the right chat, and the image stays available on
    // the order page it points to.
    //
    // A top-level navigation rather than window.open on purpose: opening a
    // window needs transient user activation, and that has already expired
    // by the time the order request comes back, so it would be blocked.
    const openRestaurantChat = data => {
        if (!data.whatsapp_url) return false;
        window.location.href = data.whatsapp_url;
        return true;
    };

    const sendButton = document.getElementById('send-whatsapp');
    sendButton?.addEventListener('click', async () => {
        if (!cart.length) {
            showCartFeedback(t('أضف طبقًا واحدًا على الأقل.', 'Add at least one dish.'));
            return;
        }

        const fulfillment = selectedFulfillment();
        const isDelivery = fulfillment === 'delivery';
        const name = orderName?.value.trim() || '';
        const phone = orderPhone?.value.trim() || '';
        const address = orderAddress?.value.trim() || '';
        const notes = document.getElementById('order-notes')?.value.trim() || '';

        if (isDelivery && (!name || !phone || !address)) {
            showCartFeedback(t('أدخل الاسم ورقم الجوال وعنوان التوصيل.', 'Enter the customer name, phone and delivery address.'));
            (!name ? orderName : !phone ? orderPhone : orderAddress)?.focus();
            return;
        }
        const phoneDigits = phone.replace(/\D/g, '');
        const phoneHasInvalidCharacters = /[^0-9٠-٩۰-۹+\-()\s]/.test(phone);
        if (isDelivery && (phoneHasInvalidCharacters || phoneDigits.length < 7 || phoneDigits.length > 15)) {
            showCartFeedback(t('أدخل رقم جوال صحيحًا للتوصيل.', 'Enter a valid delivery phone number.'));
            orderPhone?.focus();
            return;
        }

        const originalLabel = sendButton.innerHTML;
        sendButton.disabled = true;
        sendButton.textContent = t('جارٍ إنشاء الطلب…', 'Creating order…');

        try {
            const response = await fetch(orderEndpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': csrfToken()},
                body: JSON.stringify({
                    items: cart.map(item => ({
                        id: item.id,
                        qty: item.qty,
                        ...(item.variantId ? {variant_id: item.variantId} : {}),
                        ...(item.addonIds?.length ? {addon_ids: item.addonIds} : {}),
                    })),
                    fulfillment,
                    name,
                    phone,
                    address,
                    notes,
                }),
            });

            let data = {};
            try { data = await response.json(); } catch (_) { data = {}; }

            if (!response.ok) {
                showCartFeedback(data.error || t('تعذر إنشاء الطلب. حاول مجددًا.', 'Could not create the order. Try again.'));
                return;
            }

            // The order is recorded on the server now, so the cart has done
            // its job. Clear it before going anywhere, because assigning
            // location.href ends this page's work immediately.
            cart = [];
            saveCart();
            closeCart();

            if (!openRestaurantChat(data)) {
                // The order exists but there is nowhere to send it. Show the
                // number so the customer is not left with a lost order.
                showCartFeedback(t(
                    `تم تسجيل الطلب ${data.code} لكن رقم واتساب غير مضبوط. أبلغ المطعم بالرقم.`,
                    `Order ${data.code} was saved but no WhatsApp number is configured. Give the restaurant this number.`,
                ));
            }
        } catch (_) {
            showCartFeedback(t('تعذر الاتصال بالخادم. تحقق من الإنترنت.', 'Could not reach the server. Check your connection.'));
        } finally {
            sendButton.disabled = false;
            sendButton.innerHTML = originalLabel;
        }
    });

    // Mobile navigation
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.main-nav');
    const mobileNavQuery = window.matchMedia('(max-width: 820px)');
    const setNavOpen = open => {
        if (!nav || !navToggle) return;
        const shouldOpen = Boolean(open && mobileNavQuery.matches);
        nav.classList.toggle('open', shouldOpen);
        navToggle.setAttribute('aria-expanded', String(shouldOpen));
        navToggle.setAttribute(
            'aria-label',
            shouldOpen ? navToggle.dataset.closeLabel : navToggle.dataset.openLabel,
        );
        body.classList.toggle('nav-open', shouldOpen);
        if (mobileNavQuery.matches) {
            nav.setAttribute('aria-hidden', String(!shouldOpen));
        } else {
            nav.removeAttribute('aria-hidden');
        }
    };
    navToggle?.addEventListener('click', event => {
        event.stopPropagation();
        setNavOpen(!nav?.classList.contains('open'));
    });
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        setNavOpen(false);
    }));
    document.addEventListener('click', event => {
        if (!nav?.classList.contains('open')) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target && !target.closest('.main-nav') && !target.closest('.nav-toggle')) setNavOpen(false);
    });
    const handleNavViewportChange = () => setNavOpen(false);
    mobileNavQuery.addEventListener?.('change', handleNavViewportChange);
    window.addEventListener('orientationchange', handleNavViewportChange);
    setNavOpen(false);

    // Header state and active navigation
    const header = document.querySelector('.site-header');
    // The category bar and results bar stick right under the header, at an
    // offset sized for the header being there. When the header hides, that
    // offset has to follow it — driven from JS rather than a CSS :has()
    // rule, because browsers do not reliably re-run position:sticky's own
    // offset calculation off a :has()-triggered class change.
    const stickyCategoryBar = document.getElementById('category-filter-bar');
    const stickyResultsBar = document.querySelector('.menu-results-bar');
    const syncStickyBarOffsets = headerIsHidden => {
        stickyCategoryBar?.style.setProperty('top', headerIsHidden ? '4px' : '');
        stickyResultsBar?.style.setProperty('top', headerIsHidden ? '93px' : '');
    };
    // Mobile only: hide the header on the way down to give content more
    // room now that the bottom nav is always there for navigation, and
    // bring it right back on the way up so nothing behind it is ever more
    // than one upward scroll away.
    let lastScrollY = window.scrollY;
    const onScroll = () => {
        const currentY = window.scrollY;
        header?.classList.toggle('scrolled', currentY > 18);
        const delta = currentY - lastScrollY;
        let headerIsHidden = header?.classList.contains('header-hidden') ?? false;
        if (!mobileNavQuery.matches || body.classList.contains('nav-open') || currentY <= 80) {
            headerIsHidden = false;
        } else if (delta > 6) {
            headerIsHidden = true;
        } else if (delta < -6) {
            headerIsHidden = false;
        }
        header?.classList.toggle('header-hidden', headerIsHidden);
        syncStickyBarOffsets(headerIsHidden);
        lastScrollY = currentY;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Category filtering
    const filterButtons = document.querySelectorAll('[data-filter]');
    const cards = document.querySelectorAll('.menu-card[data-category]');
    const filterEmpty = document.getElementById('filter-empty');
    const menuGrid = document.getElementById('menu-grid');
    const activeFilterLabel = document.getElementById('active-filter-label');
    const visibleMenuCount = document.getElementById('visible-menu-count');
    const totalMenuCount = document.getElementById('total-menu-count');
    const loadMoreButton = document.getElementById('menu-load-more');
    const remainingMenuCount = document.getElementById('remaining-menu-count');
    const menuSearch = document.getElementById('menu-search');
    const pageSize = Math.max(1, Number(menuGrid?.dataset.pageSize) || 6);
    let currentFilter = 'all';
    let visibleLimit = pageSize;
    const applyFilter = (filter, {
        scrollToMenu = false,
        source = null,
        resetLimit = true,
    } = {}) => {
        currentFilter = filter;
        if (resetLimit) visibleLimit = pageSize;
        const searchTerm = (menuSearch?.value || '').trim().toLocaleLowerCase();
        filterButtons.forEach(button => {
            const active = button.dataset.filter === filter;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const matchingCards = [...cards].filter(card => {
            const matchesCategory = filter === 'all' || card.dataset.category === filter;
            const matchesSearch = !searchTerm || (card.dataset.search || card.textContent)
                .toLocaleLowerCase()
                .includes(searchTerm);
            return matchesCategory && matchesSearch;
        });
        cards.forEach(card => card.classList.add('is-hidden'));
        const visibleCards = matchingCards.slice(0, visibleLimit);
        visibleCards.forEach(card => card.classList.remove('is-hidden'));
        const visibleCount = visibleCards.length;
        const totalCount = matchingCards.length;
        const remainingCount = Math.max(0, totalCount - visibleCount);
        const labelSource = source || [...filterButtons].find(button => (
            button.dataset.filter === filter && button.dataset.filterLabel
        ));
        if (activeFilterLabel && labelSource?.dataset.filterLabel) {
            activeFilterLabel.textContent = labelSource.dataset.filterLabel;
        }
        if (visibleMenuCount) visibleMenuCount.textContent = visibleCount;
        if (totalMenuCount) totalMenuCount.textContent = totalCount;
        if (remainingMenuCount) remainingMenuCount.textContent = remainingCount;
        if (loadMoreButton) {
            const shouldShow = remainingCount > 0;
            loadMoreButton.classList.toggle('hidden', !shouldShow);
            loadMoreButton.hidden = !shouldShow;
        }
        if (filterEmpty) {
            const isEmpty = totalCount === 0;
            filterEmpty.classList.toggle('hidden', !isEmpty);
            filterEmpty.hidden = !isEmpty;
        }
        visibleCards.slice(0, 8).forEach((card, index) => {
            card.animate(
                [
                    {opacity: .25, transform: 'translateY(8px)'},
                    {opacity: 1, transform: 'translateY(0)'},
                ],
                {duration: 220, delay: index * 22, easing: 'ease-out'},
            );
        });
        source?.scrollIntoView?.({behavior: 'smooth', block: 'nearest', inline: 'center'});
        if (scrollToMenu && window.matchMedia('(max-width: 560px)').matches) {
            window.setTimeout(() => menuGrid?.scrollIntoView({behavior: 'smooth', block: 'start'}), 80);
        }
    };
    filterButtons.forEach(button => button.addEventListener('click', () => {
        if (button.dataset.clearSearch === 'true' && menuSearch) {
            menuSearch.value = '';
        }
        applyFilter(
            button.dataset.filter || 'all',
            {scrollToMenu: true, source: button},
        );
    }));
    document.querySelectorAll('[data-footer-filter]').forEach(link => link.addEventListener('click', () => {
        applyFilter(link.dataset.footerFilter || 'all', {scrollToMenu: true});
    }));
    loadMoreButton?.addEventListener('click', () => {
        visibleLimit += pageSize;
        applyFilter(currentFilter, {resetLimit: false});
        const lastVisibleCard = [...cards].filter(card => !card.classList.contains('is-hidden')).at(-1);
        lastVisibleCard?.focus?.({preventScroll: true});
    });
    menuSearch?.addEventListener('input', () => {
        const searchFilter = menuSearch.value.trim() ? 'all' : currentFilter;
        applyFilter(searchFilter, {resetLimit: true});
    });
    const initialFilter = [...filterButtons].find(button => button.classList.contains('active'));
    applyFilter(initialFilter?.dataset.filter || 'all');

    // Lightweight testimonial motion
    const reviewTrack = document.querySelector('.reviews-track');
    document.querySelector('.review-arrow.next')?.addEventListener('click', () => {
        const first = reviewTrack?.firstElementChild;
        if (!first) return;
        reviewTrack.append(first);
        first.animate([{opacity:.2, transform:'translateX(-18px)'},{opacity:1, transform:'translateX(0)'}], {duration:320, easing:'ease-out'});
    });
    document.querySelector('.review-arrow.prev')?.addEventListener('click', () => {
        const last = reviewTrack?.lastElementChild;
        if (!last) return;
        reviewTrack.prepend(last);
        last.animate([{opacity:.2, transform:'translateX(18px)'},{opacity:1, transform:'translateX(0)'}], {duration:320, easing:'ease-out'});
    });

    // Keep the active link aligned with the section that has reached the header.
    const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
    const sectionLinks = navLinks
        .map(link => ({link, section: document.querySelector(link.getAttribute('href'))}))
        .filter(item => item.section);
    let navFrame = null;
    const updateActiveNav = () => {
        navFrame = null;
        if (!sectionLinks.length) return;
        const headerOffset = (header?.getBoundingClientRect().height || 0) + 24;
        const currentPosition = window.scrollY + headerOffset;
        let current = sectionLinks[0];
        sectionLinks.forEach(item => {
            if (item.section.offsetTop <= currentPosition) current = item;
        });
        navLinks.forEach(link => {
            const active = link === current.link;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
    };
    const requestActiveNavUpdate = () => {
        if (navFrame !== null) return;
        navFrame = window.requestAnimationFrame(updateActiveNav);
    };
    updateActiveNav();
    window.addEventListener('scroll', requestActiveNavUpdate, {passive: true});
    window.addEventListener('resize', requestActiveNavUpdate, {passive: true});

    // FAQ accordion
    document.querySelectorAll('.faq-item button').forEach(button => {
        button.addEventListener('click', () => {
            const item = button.closest('.faq-item');
            const willOpen = !item.classList.contains('open');
            document.querySelectorAll('.faq-item.open').forEach(openItem => {
                openItem.classList.remove('open');
                openItem.querySelector('button')?.setAttribute('aria-expanded', 'false');
                openItem.querySelector('.faq-answer')?.setAttribute('aria-hidden', 'true');
            });
            item.classList.toggle('open', willOpen);
            button.setAttribute('aria-expanded', String(willOpen));
            item.querySelector('.faq-answer')?.setAttribute('aria-hidden', String(!willOpen));
        });
    });

    document.querySelector('.reservation-form')?.addEventListener('submit', event => {
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        if (!submitButton || submitButton.disabled) return;
        submitButton.disabled = true;
        const label = submitButton.dataset.submitLabel;
        if (label) submitButton.querySelector('b').textContent = label;
    });

    // Reveal-on-scroll animations
    const revealElements = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -30px' });
        revealElements.forEach(element => observer.observe(element));
    } else {
        revealElements.forEach(element => element.classList.add('revealed'));
    }

    // Subtle hero parallax, disabled on touch/reduced motion
    const parallax = document.querySelector('.js-parallax');
    if (parallax && matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        parallax.addEventListener('pointermove', event => {
            const rect = parallax.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - .5;
            const y = (event.clientY - rect.top) / rect.height - .5;
            parallax.style.transform = `perspective(900px) rotateY(${x * 4}deg) rotateX(${y * -4}deg)`;
        });
        parallax.addEventListener('pointerleave', () => parallax.style.transform = '');
    }

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && getDrawer()?.classList.contains('is-open')) closeCart();
        else if (event.key === 'Escape' && getDishDialog()?.classList.contains('is-open')) closeDishDialog();
        else if (event.key === 'Escape' && nav?.classList.contains('open')) {
            setNavOpen(false);
            navToggle?.focus();
        }
        if (event.key === 'Tab' && getDrawer()?.classList.contains('is-open')) {
            const focusable = drawerFocusable();
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        if (event.key === 'Tab' && getDishDialog()?.classList.contains('is-open')) {
            const focusable = dishDialogFocusable();
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element) {
            const openTrigger = event.target.closest('.js-open-dish');
            if (openTrigger) {
                event.preventDefault();
                openDishDialog(openTrigger.closest('.menu-card'));
            }
        }
    });

    syncCartWithPage();
    saveCart();
    updateDeliveryFields();
    if (new URLSearchParams(window.location.search).get('focus') === 'search') focusMenuSearch();
    const refreshIcons = () => {
        if (!window.lucide?.createIcons) return;
        window.lucide.createIcons();
        document.documentElement.classList.add('icons-ready');
    };
    document.addEventListener('DOMContentLoaded', refreshIcons);
    window.addEventListener('load', refreshIcons);
})();
