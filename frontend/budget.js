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
    const BASE_URL = window.BILLMATE_API_BASE_URL ||
        ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
            ? "http://localhost:5000"
            : "https://billmate-backend.onrender.com");
    const API_URL = `${BASE_URL}/api/bills`;

    let userBudget = Number(localStorage.getItem("userBudget")) || 50000;
    let bills = [];

    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    });

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

        // Calculate this month's spending
        let totalSpent = 0;
        bills.forEach(b => {
            if (b.date && b.date.startsWith(currentMonthStr)) {
                totalSpent += Number(b.amount || 0);
            }
        });

        // If no bills found for current month, calculate total across all bills
        if (totalSpent === 0 && bills.length > 0) {
            totalSpent = bills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
        }

        const remaining = userBudget - totalSpent;
        const usedPct = userBudget > 0 ? Math.min(100, Math.round((totalSpent / userBudget) * 100)) : 0;
        const remainingPct = Math.max(0, 100 - usedPct);

        // Update Overview Card
        if ($("budgetPageTotal")) $("budgetPageTotal").innerText = `₹${userBudget.toLocaleString()}`;
        if ($("budgetPageSpent")) $("budgetPageSpent").innerText = `₹${totalSpent.toLocaleString()}`;
        if ($("budgetPageSpentPct")) $("budgetPageSpentPct").innerText = `• ${usedPct}% of budget`;
        if ($("budgetPageRemaining")) {
            $("budgetPageRemaining").innerText = `₹${Math.max(0, remaining).toLocaleString()}`;
            $("budgetPageRemaining").style.color = remaining < 0 ? '#ef4444' : '#22c55e';
        }
        if ($("budgetPageRemainingPct")) $("budgetPageRemainingPct").innerText = `• ${remainingPct}% left`;
        
        const progressBar = $("budgetPageProgressBar");
        if (progressBar) {
            progressBar.style.width = `${usedPct}%`;
            progressBar.style.background = remaining < 0 ? '#ef4444' : usedPct >= 85 ? '#f97316' : '#3b82f6';
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
            { name: 'May 2024', budget: userBudget, spent: currentSpent || 41100 },
            { name: 'Apr 2024', budget: 45000, spent: 40250 },
            { name: 'Mar 2024', budget: 45000, spent: 38600 },
            { name: 'Feb 2024', budget: 40000, spent: 35120 },
            { name: 'Jan 2024', budget: 40000, spent: 32450 }
        ];

        tbody.innerHTML = months.map(m => {
            const rem = m.budget - m.spent;
            const isOnTrack = rem >= 0;
            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text);">${m.name}</td>
                    <td>₹${m.budget.toLocaleString()}</td>
                    <td style="font-weight: 600;">₹${m.spent.toLocaleString()}</td>
                    <td style="color: ${isOnTrack ? '#22c55e' : '#ef4444'}; font-weight: 600;">₹${rem.toLocaleString()}</td>
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
            const val = Number($("budgetAmountInput").value);

            if (isNaN(val) || val <= 0) {
                alert("Please enter a valid monthly budget greater than ₹0.");
                return;
            }

            userBudget = val;
            localStorage.setItem("userBudget", val);

            // Update userSettings JSON as well
            try {
                const raw = JSON.parse(localStorage.getItem("userSettings") || "{}");
                raw.budget = val;
                localStorage.setItem("userSettings", JSON.stringify(raw));
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
