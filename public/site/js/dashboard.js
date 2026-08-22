/* Customer desk enhancements. The page works fully without JavaScript:
   search and sort are plain form submits, and the detail panels are native
   <details> elements. */
(function () {
    'use strict';

    // Same key and values as the Django admin's toggle, so switching here
    // switches the admin too.
    var STORAGE_KEY = 'theme';
    var root = document.documentElement;

    function systemPrefersDark() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function currentTheme() {
        var set = root.getAttribute('data-theme');
        if (set === 'light' || set === 'dark') {
            return set;
        }
        return systemPrefersDark() ? 'dark' : 'light';  // covers 'auto' and unset
    }

    function paintToggle(toggle) {
        var isDark = currentTheme() === 'dark';
        var label = toggle.querySelector('[data-theme-label]');
        toggle.setAttribute('aria-pressed', String(isDark));
        if (label) {
            label.textContent = isDark ? 'الوضع الفاتح' : 'الوضع الداكن';
        }
    }

    var toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
        paintToggle(toggle);
        toggle.addEventListener('click', function () {
            var next = currentTheme() === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch (error) { /* private mode — the choice just won't persist */ }
            paintToggle(toggle);
        });
    }

    /* The sidebar collapses on narrow screens and this button reveals it. */
    var navToggle = document.querySelector('[data-nav-toggle]');
    var sidebar = document.getElementById('sidebar');
    if (navToggle && sidebar) {
        navToggle.addEventListener('click', function () {
            var open = sidebar.classList.toggle('is-open');
            navToggle.setAttribute('aria-expanded', String(open));
        });
    }

    /* Changing the sort order applies it straight away. */
    var sorter = document.querySelector('[data-auto-submit]');
    if (sorter) {
        sorter.addEventListener('change', function () {
            sorter.form.submit();
        });
    }

    /* Opening one customer closes the previous one, so the list stays short. */
    var rows = Array.prototype.slice.call(document.querySelectorAll('.customer'));
    rows.forEach(function (row) {
        row.addEventListener('toggle', function () {
            if (!row.open) {
                return;
            }
            rows.forEach(function (other) {
                if (other !== row) {
                    other.open = false;
                }
            });
        });
    });

    /* Destructive actions ask first. Without JavaScript the form still
       submits, which is why the server never deletes on a GET. */
    document.querySelectorAll('[data-confirm]').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (!window.confirm(form.dataset.confirm)) {
                event.preventDefault();
            }
        });
    });

    /* Checkbox fields read better with the label beside the box. */
    document.querySelectorAll('.field').forEach(function (field) {
        if (field.querySelector('input[type="checkbox"]')) {
            field.classList.add('field-checkbox');
        }
    });

    /* Guard against double-submitting a confirmation on a slow connection.
       Only the second submit is blocked — disabling a submit button would
       drop its value from the form data. */
    document.querySelectorAll('.inline-form').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (form.dataset.submitting === 'true') {
                event.preventDefault();
                return;
            }
            form.dataset.submitting = 'true';
        });
    });

    /* Cashier quantities and total preview. The server repeats the price
       calculation from the database when saving; this preview is only a
       convenience for the employee. */
    var cashierForm = document.querySelector('[data-cashier-form]');
    if (cashierForm) {
        var quantityInputs = Array.prototype.slice.call(
            cashierForm.querySelectorAll('[data-cashier-qty]')
        );
        var countOutput = cashierForm.querySelector('[data-cashier-count]');
        var totalOutput = cashierForm.querySelector('[data-cashier-total]');

        function updateCashierSummary() {
            var count = 0;
            var total = 0;
            quantityInputs.forEach(function (input) {
                var quantity = Math.max(0, Math.min(99, parseInt(input.value || '0', 10) || 0));
                var price = parseFloat(input.dataset.price || '0') || 0;
                input.value = quantity;
                count += quantity;
                total += quantity * price;
            });
            if (countOutput) countOutput.textContent = String(count);
            if (totalOutput) {
                totalOutput.textContent = total.toLocaleString('ar', {
                    minimumFractionDigits: total % 1 ? 2 : 0,
                    maximumFractionDigits: 2
                });
            }
        }

        cashierForm.querySelectorAll('[data-qty-step]').forEach(function (button) {
            button.addEventListener('click', function () {
                var input = button.parentElement.querySelector('[data-cashier-qty]');
                if (!input) return;
                var next = (parseInt(input.value || '0', 10) || 0) + Number(button.dataset.qtyStep);
                input.value = Math.max(0, Math.min(99, next));
                updateCashierSummary();
            });
        });
        quantityInputs.forEach(function (input) {
            input.addEventListener('input', updateCashierSummary);
        });
        updateCashierSummary();
    }
}());
