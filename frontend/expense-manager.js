/**
 * BillMate Unified Expense Manager
 * Handles manual expense entry (Web & Mobile) and native Android
 * payment notification auto-detection confirmation.
 */
(function () {
  'use strict';

  let expenseModalEl = null;
  let activeFingerprint = null;
  let activeSourceApp = 'Manual';

  // --- 1. MODAL HTML INJECTION ---
  function ensureExpenseModal() {
    if (document.getElementById('billmateExpenseModal')) {
      expenseModalEl = document.getElementById('billmateExpenseModal');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'billmateExpenseModal';
    modal.className = 'expense-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="expense-modal-card" role="dialog" aria-modal="true" aria-labelledby="expenseModalTitle">
        <div class="expense-modal-header">
          <div class="expense-modal-title-wrap">
            <div class="expense-header-icon">
              <i data-lucide="receipt"></i>
            </div>
            <div>
              <h3 id="expenseModalTitle">Add Expense</h3>
              <p class="expense-modal-subtitle">Record an outgoing payment or expense</p>
            </div>
          </div>
          <button type="button" class="expense-modal-close-btn" id="closeExpenseModalBtn" aria-label="Close modal">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div id="expenseAutoDetectBanner" class="expense-autodetect-banner" style="display:none;">
          <span class="banner-icon">⚡</span>
          <div class="banner-text">
            <strong>Payment Detected:</strong>
            <span id="expenseAutoDetectText">Please verify the details below and confirm to save.</span>
          </div>
        </div>

        <div id="expenseModalAlert" class="expense-modal-alert" style="display:none;"></div>

        <form id="billmateExpenseForm" class="expense-modal-form" novalidate>
          <div class="expense-form-group">
            <label for="expenseAmountInput">Amount (₹) <span class="required">*</span></label>
            <div class="expense-input-wrapper">
              <span class="currency-prefix">₹</span>
              <input type="number" id="expenseAmountInput" step="0.01" min="0.01" placeholder="0.00" required />
            </div>
            <small class="field-hint" id="expenseAmountHint" style="display:none; color:#f97316;">Please enter the payment amount manually.</small>
          </div>

          <div class="expense-form-group">
            <label for="expenseNameInput">Expense / Merchant Name <span class="required">*</span></label>
            <input type="text" id="expenseNameInput" placeholder="e.g., Starbucks, Swiggy, Groceries" maxlength="100" required />
          </div>

          <div class="expense-form-row">
            <div class="expense-form-group">
              <label for="expenseCategorySelect">Category <span class="required">*</span></label>
              <select id="expenseCategorySelect" required>
                <option value="Food">Food & Dining</option>
                <option value="Bills">Bills & Utilities</option>
                <option value="Shopping">Shopping</option>
                <option value="Rent">Rent & Housing</option>
                <option value="Travel">Travel & Fuel</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Subscription">Subscription</option>
                <option value="Health">Health & Fitness</option>
                <option value="Insurance">Insurance</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="expense-form-group">
              <label for="expensePaymentMethodSelect">Payment Method</label>
              <select id="expensePaymentMethodSelect">
                <option value="UPI">UPI</option>
                <option value="Google Pay">Google Pay</option>
                <option value="PhonePe">PhonePe</option>
                <option value="Paytm">Paytm</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Cash">Cash</option>
                <option value="Net Banking">Net Banking</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div class="expense-form-group">
            <label for="expenseDateInput">Date <span class="required">*</span></label>
            <input type="date" id="expenseDateInput" required />
          </div>

          <div class="expense-form-group">
            <label for="expenseNotesInput">Notes (Optional)</label>
            <textarea id="expenseNotesInput" rows="2" placeholder="Add additional details or remarks" maxlength="500"></textarea>
          </div>

          <div class="expense-modal-actions">
            <button type="button" class="btn-expense-cancel" id="cancelExpenseModalBtn">Cancel</button>
            <button type="submit" class="btn-expense-save" id="saveExpenseBtn">
              <i data-lucide="check"></i> Confirm & Save Expense
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    expenseModalEl = modal;

    // Bind Close buttons
    const closeBtn = document.getElementById('closeExpenseModalBtn');
    const cancelBtn = document.getElementById('cancelExpenseModalBtn');
    if (closeBtn) closeBtn.onclick = () => window.closeAddExpenseModal();
    if (cancelBtn) cancelBtn.onclick = () => window.closeAddExpenseModal();

    // Close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) window.closeAddExpenseModal();
    };

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        window.closeAddExpenseModal();
      }
    });

    // Form submit
    const form = document.getElementById('billmateExpenseForm');
    if (form) form.onsubmit = handleExpenseFormSubmit;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // --- 2. OPEN & PREFILL EXPENSE MODAL ---
  window.openAddExpenseModal = function (prefill = null) {
    ensureExpenseModal();
    if (!expenseModalEl) return;

    // Reset Form
    const form = document.getElementById('billmateExpenseForm');
    if (form) form.reset();

    const banner = document.getElementById('expenseAutoDetectBanner');
    const bannerText = document.getElementById('expenseAutoDetectText');
    const alertBox = document.getElementById('expenseModalAlert');
    const amountHint = document.getElementById('expenseAmountHint');
    if (alertBox) alertBox.style.display = 'none';

    // Default Date to Today
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('expenseDateInput');
    if (dateInput) dateInput.value = todayStr;

    activeFingerprint = null;
    activeSourceApp = 'Manual';

    if (prefill) {
      activeFingerprint = prefill.fingerprint || null;
      activeSourceApp = prefill.sourceApp || 'Manual';

      // Show detected banner
      if (banner && bannerText) {
        banner.style.display = 'flex';
        bannerText.textContent = `Auto-detected from ${prefill.sourceApp || 'payment app'}. Review and confirm to save.`;
      }

      // Prefill Amount
      const amtInput = document.getElementById('expenseAmountInput');
      if (amtInput) {
        if (prefill.amount && Number(prefill.amount) > 0) {
          amtInput.value = Number(prefill.amount).toFixed(2);
          if (amountHint) amountHint.style.display = 'none';
        } else {
          amtInput.value = '';
          if (amountHint) amountHint.style.display = 'block';
          amtInput.focus();
        }
      }

      // Prefill Merchant Name
      const nameInput = document.getElementById('expenseNameInput');
      if (nameInput) {
        nameInput.value = prefill.merchant || '';
      }

      // Prefill Payment Method
      const methodSelect = document.getElementById('expensePaymentMethodSelect');
      if (methodSelect && prefill.sourceApp) {
        const matchingOption = Array.from(methodSelect.options).find(opt =>
          opt.value.toLowerCase() === prefill.sourceApp.toLowerCase()
        );
        if (matchingOption) {
          methodSelect.value = matchingOption.value;
        } else {
          methodSelect.value = 'UPI';
        }
      }

      // Prefill Date if provided
      if (prefill.timestamp && dateInput) {
        try {
          const d = new Date(prefill.timestamp);
          if (!isNaN(d.getTime())) {
            dateInput.value = d.toISOString().split('T')[0];
          }
        } catch (_) {}
      }
    } else {
      if (banner) banner.style.display = 'none';
      if (amountHint) amountHint.style.display = 'none';
    }

    expenseModalEl.style.display = 'flex';
    document.body.classList.add('modal-open');

    // Auto focus first empty field
    setTimeout(() => {
      const amt = document.getElementById('expenseAmountInput');
      const name = document.getElementById('expenseNameInput');
      if (!amt || !amt.value) amt?.focus();
      else if (!name || !name.value) name?.focus();
    }, 100);
  };

  window.closeAddExpenseModal = function () {
    if (expenseModalEl) {
      expenseModalEl.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  };

  // --- 3. SUBMIT & SAVE EXPENSE ---
  async function handleExpenseFormSubmit(e) {
    e.preventDefault();

    const alertBox = document.getElementById('expenseModalAlert');
    const saveBtn = document.getElementById('saveExpenseBtn');

    function showError(msg) {
      if (!alertBox) return alert(msg);
      alertBox.textContent = msg;
      alertBox.style.display = 'block';
    }

    const amountVal = parseFloat(document.getElementById('expenseAmountInput')?.value);
    if (isNaN(amountVal) || amountVal <= 0) {
      showError('Please enter a valid expense amount greater than ₹0.');
      document.getElementById('expenseAmountInput')?.focus();
      return;
    }

    const nameVal = document.getElementById('expenseNameInput')?.value?.trim();
    if (!nameVal) {
      showError('Please enter the merchant or expense name.');
      document.getElementById('expenseNameInput')?.focus();
      return;
    }

    const categoryVal = document.getElementById('expenseCategorySelect')?.value || 'Other';
    const methodVal = document.getElementById('expensePaymentMethodSelect')?.value || 'Other';
    const dateVal = document.getElementById('expenseDateInput')?.value || new Date().toISOString().split('T')[0];
    const notesVal = document.getElementById('expenseNotesInput')?.value?.trim() || '';

    const payload = {
      name: nameVal,
      amount: amountVal,
      date: dateVal,
      category: categoryVal,
      notes: notesVal,
      type: 'expense',
      paymentMethod: methodVal,
      sourceApp: activeSourceApp,
      transactionFingerprint: activeFingerprint
    };

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>Saving...</span>';
    }

    try {
      const response = await window.billmateFetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.duplicate) {
        showError('Notice: This transaction has already been recorded as an expense.');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i data-lucide="check"></i> Confirm & Save Expense';
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      if (!response.ok) {
        const errorMsg = (window.extractApiErrorMessage && window.extractApiErrorMessage(data)) ||
          data.error || data.message || 'Failed to save expense.';
        showError(errorMsg);
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i data-lucide="check"></i> Confirm & Save Expense';
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      // Success! Close modal and refresh current page data
      window.closeAddExpenseModal();

      // Trigger notifications refresh
      if (typeof window.refreshBillmateNotifications === 'function') {
        window.refreshBillmateNotifications();
      }

      // Trigger page-specific re-renders
      if (window.location.pathname.includes('dashboard') && typeof window.runDashboardLogic === 'function') {
        window.location.reload();
      } else if (window.location.pathname.includes('expenses') || window.location.pathname.includes('bills') || window.location.pathname.includes('budget')) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Error saving expense:', err);
      showError('Unable to connect to the server. Please check your network connection.');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="check"></i> Confirm & Save Expense';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // --- 4. NATIVE ANDROID NOTIFICATION BRIDGE ---
  async function checkNativePendingExpense() {
    if (!window.isBillmateAndroid || !window.isBillmateAndroid()) return;
    if (!window.Capacitor?.Plugins?.BillMateExpense) return;

    try {
      const { BillMateExpense } = window.Capacitor.Plugins;

      // 1. Check for pending expense passed via notification intent
      const res = await BillMateExpense.getPendingExpense();
      if (res && res.hasPending && res.expense) {
        window.openAddExpenseModal(res.expense);
        await BillMateExpense.clearPendingExpense();
      }

      // 2. Listen for real-time detected payments while app is in foreground
      BillMateExpense.addListener('onExpenseDetected', (expense) => {
        if (expense) {
          window.openAddExpenseModal(expense);
        }
      });
    } catch (err) {
      console.warn('[ExpenseManager] Native bridge check:', err.message);
    }
  }

  // Init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureExpenseModal();
      checkNativePendingExpense();
    });
  } else {
    ensureExpenseModal();
    checkNativePendingExpense();
  }
})();
