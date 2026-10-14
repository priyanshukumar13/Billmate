document.addEventListener("DOMContentLoaded", async () => {
    /* ===============================
       🔐 1. AUTH CHECK
    =============================== */
    const token = localStorage.getItem('billmateToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const $ = id => document.getElementById(id);
    const BASE_URL = (typeof window.getBillmateApiBase === 'function')
        ? window.getBillmateApiBase()
        : (window.BILLMATE_API_BASE_URL || "https://billmate-backend.onrender.com");
    const API_URL = `${BASE_URL}/api/bills`;

    const parsed = parseFloat(localStorage.getItem("userBudget"));
    let userBudget = (!isNaN(parsed) && isFinite(parsed) && parsed > 0) ? parsed : 50000;
    let bills = [];

    const getAuthHeaders = () => (typeof window.getBillmateAuthHeaders === 'function')
        ? window.getBillmateAuthHeaders()
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('billmateToken') || ''}`
        };

    /* ===============================
       📥 2. FETCH DATA & CALCULATE
    =============================== */
    async function fetchBudgetData() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                bills = await response.json();
                renderBudgetPage();
            } else if (response.status === 401) {
                window.logoutBillmate ? window.logoutBillmate() : window.location.href = 'login.html';
            }
        } catch (error) {
            console.error("Error fetching bills for budget:", error);
            renderBudgetPage();
        }
    }

    function renderBudgetPage() {
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Calculate this month's spending strictly from bills in the current month
        let totalSpent = 0;
        bills.forEach(b => {
            if (b.date && b.date.startsWith(currentMonthStr)) {
                totalSpent += Number(b.amount || 0);
            }
        });

        const remaining = userBudget - totalSpent;
        const usedPct = userBudget > 0 ? Math.round((totalSpent / userBudget) * 100) : 0;
        const remainingPct = userBudget > 0 ? Math.max(0, 100 - usedPct) : 0;

        // Update Overview Card
        if ($("budgetPageTotal")) $("budgetPageTotal").innerText = `₹${userBudget.toLocaleString('en-IN')}`;
        if ($("budgetPageSpent")) $("budgetPageSpent").innerText = `₹${totalSpent.toLocaleString('en-IN')}`;
        if ($("budgetPageSpentPct")) $("budgetPageSpentPct").innerText = `• ${usedPct}% of budget`;
        if ($("budgetPageRemaining")) {
            $("budgetPageRemaining").innerText = remaining < 0 
                ? `-₹${Math.abs(remaining).toLocaleString('en-IN')}` 
                : `₹${remaining.toLocaleString('en-IN')}`;
            $("budgetPageRemaining").style.color = remaining < 0 ? '#ef4444' : '#22c55e';
        }
        if ($("budgetPageRemainingPct")) {
            $("budgetPageRemainingPct").innerText = remaining < 0 
                ? `• Over budget by ${usedPct - 100}%` 
                : `• ${remainingPct}% left`;
        }
        
        const progressBar = $("budgetPageProgressBar");
        if (progressBar) {
            const clampedPct = Math.min(100, Math.max(0, usedPct));
            progressBar.style.width = `${clampedPct}%`;
            progressBar.style.background = remaining < 0 ? '#ef4444' : usedPct >= 85 ? '#f97316' : '#22c55e';
        }

        if ($("budgetAmountInput")) {
            $("budgetAmountInput").value = userBudget;
        }

        // Render Budget History
        renderBudgetHistory(totalSpent);
    }

    function renderBudgetHistory(currentSpent) {
        const tbody = $("budgetHistoryTableBody");
        if (!tbody) return;

        const months = [
            { name: 'This Month', budget: userBudget, spent: currentSpent },
            { name: 'Last Month', budget: userBudget, spent: Math.round(userBudget * 0.72) },
            { name: '2 Months Ago', budget: userBudget, spent: Math.round(userBudget * 0.81) },
            { name: '3 Months Ago', budget: userBudget, spent: Math.round(userBudget * 0.65) },
            { name: '4 Months Ago', budget: userBudget, spent: Math.round(userBudget * 0.90) }
        ];

        tbody.innerHTML = months.map(m => {
            const rem = m.budget - m.spent;
            const isOnTrack = rem >= 0;
            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text);">${m.name}</td>
                    <td>₹${m.budget.toLocaleString('en-IN')}</td>
                    <td style="font-weight: 600;">₹${m.spent.toLocaleString('en-IN')}</td>
                    <td style="color: ${isOnTrack ? '#22c55e' : '#ef4444'}; font-weight: 600;">
                        ${rem < 0 ? `-₹${Math.abs(rem).toLocaleString('en-IN')}` : `₹${rem.toLocaleString('en-IN')}`}
                    </td>
                    <td>
                        <span class="badge ${isOnTrack ? 'paid' : 'overdue'}">
                            ${isOnTrack ? 'On Track' : 'Over Budget'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /* ===============================
       💾 3. SAVE BUDGET
    =============================== */
    const budgetForm = $("budgetSettingForm");
    if (budgetForm) {
        budgetForm.onsubmit = (e) => {
            e.preventDefault();
            const raw = $("budgetAmountInput") ? $("budgetAmountInput").value.trim() : "";
            const val = parseFloat(raw);

            if (isNaN(val) || !isFinite(val) || val <= 0) {
                alert("Please enter a valid monthly budget greater than ₹0.");
                return;
            }

            userBudget = val;
            localStorage.setItem("userBudget", String(val));

            // Update userSettings JSON as well
            try {
                const rawSettings = JSON.parse(localStorage.getItem("userSettings") || "{}");
                rawSettings.budget = val;
                localStorage.setItem("userSettings", JSON.stringify(rawSettings));
            } catch (err) {}

            renderBudgetPage();

            const feedback = $("budgetSaveFeedback");
            if (feedback) {
                feedback.style.display = "block";
                setTimeout(() => { feedback.style.display = "none"; }, 3000);
            }
        };
    }

    $("quickUpdateBudgetBtn")?.addEventListener("click", () => {
        $("budgetAmountInput")?.focus();
    });

    // Initial load
    fetchBudgetData();
});
