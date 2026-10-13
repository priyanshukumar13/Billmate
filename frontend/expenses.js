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
        : (window.BILLMATE_API_BASE_URL || "http://localhost:5000");
    const API_URL = `${BASE_URL}/api/bills`;

    let allBills = [];
    let barChartInstance = null;

    const getAuthHeaders = () => (typeof window.getBillmateAuthHeaders === 'function')
        ? window.getBillmateAuthHeaders()
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('billmateToken') || ''}`
        };

    /* ===============================
       📥 2. FETCH DATA FROM API
    =============================== */
    async function fetchExpenses() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                allBills = await response.json();
                renderExpensesAnalytics();
            } else if (response.status === 401) {
                window.logoutBillmate ? window.logoutBillmate() : window.location.href = 'login.html';
            } else {
                console.error("Failed to fetch bills. Status:", response.status);
            }
        } catch (error) {
            console.error("Error connecting to API:", error);
        }
    }

    function getBillStatusInfo(bill) {
        if (bill.status === 'Paid') {
            return { label: 'Paid', badgeClass: 'badge paid' };
        }
        if (!bill.date) {
            return { label: 'Unpaid', badgeClass: 'badge upcoming' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { label: 'Overdue', badgeClass: 'badge overdue' };
        if (diffDays === 0) return { label: 'Due Today', badgeClass: 'badge due-today' };
        if (diffDays <= 3) return { label: 'Due Soon', badgeClass: 'badge due-soon' };
        return { label: 'Upcoming', badgeClass: 'badge upcoming' };
    }

    function getCategoryIcon(cat) {
        const c = (cat || '').toLowerCase();
        if (c.includes('rent') || c.includes('house')) return 'home';
        if (c.includes('electric') || c.includes('util')) return 'zap';
        if (c.includes('water')) return 'droplet';
        if (c.includes('internet') || c.includes('wifi')) return 'wifi';
        if (c.includes('food') || c.includes('groc') || c.includes('dining')) return 'shopping-bag';
        if (c.includes('netfl') || c.includes('sub') || c.includes('stream')) return 'tv';
        if (c.includes('gym') || c.includes('fit') || c.includes('health')) return 'activity';
        if (c.includes('insur')) return 'shield-check';
        return 'receipt';
    }

    /* ===============================
       📊 3. CALCULATIONS & RENDERING
    =============================== */
    function renderExpensesAnalytics() {
        let totalSpending = 0;
        let highest = { amount: 0, name: 'None' };
        const categoryBreakdown = {};

        allBills.forEach(b => {
            const amt = Number(b.amount || 0);
            totalSpending += amt;

            if (amt > highest.amount) {
                highest = { amount: amt, name: b.name };
            }

            const cat = b.category || 'Other';
            categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amt;
        });

        const totalTransactions = allBills.length;
        const averageBill = totalTransactions > 0 ? Math.round(totalSpending / totalTransactions) : 0;

        // 1. Update 4 Top Stat Cards
        if ($("stat-total-spending")) $("stat-total-spending").innerText = `₹${totalSpending.toLocaleString()}`;
        if ($("stat-average-bill")) $("stat-average-bill").innerText = `₹${averageBill.toLocaleString()}`;
        if ($("stat-highest-bill")) $("stat-highest-bill").innerText = `₹${highest.amount.toLocaleString()}`;
        if ($("stat-highest-name")) $("stat-highest-name").innerText = highest.name || "No bills";
        if ($("stat-total-transactions")) $("stat-total-transactions").innerText = totalTransactions;

        // 2. Spending by Category Donut Chart
        renderCategoryDonut(categoryBreakdown, totalSpending);

        // 3. Individual Bill Comparison Bar Chart
        renderBarChart();

        // 4. Expense History Table
        renderExpenseHistory();
    }

    function renderCategoryDonut(exp, total) {
        const chart = $("expenses-category-chart");
        const legendEl = $("expenses-category-legend");
        if ($("donut-center-total")) $("donut-center-total").innerText = `₹${total.toLocaleString()}`;

        if (!chart || !legendEl) return;

        if (total === 0) {
            chart.style.background = "conic-gradient(#f1f5f9 0% 100%)";
            legendEl.innerHTML = "<p style='color:#64748b; font-size:0.8rem;'>No spending recorded.</p>";
            return;
        }

        const colors = {
            Rent: '#3b82f6',
            Utilities: '#22c55e',
            Food: '#facc15',
            Entertainment: '#ef4444',
            Subscription: '#ec4899',
            Bills: '#f97316',
            Other: '#a855f7'
        };

        let gradientParts = [];
        let currentPct = 0;
        let legendHTML = "";

        Object.entries(exp).forEach(([cat, amt]) => {
            if (amt > 0) {
                const pct = (amt / total) * 100;
                const nextPct = currentPct + pct;
                const color = colors[cat] || colors.Other;
                gradientParts.push(`${color} ${currentPct}% ${nextPct}%`);
                currentPct = nextPct;

                legendHTML += `
                    <div class="legend-item">
                        <div class="legend-item-left">
                            <span class="dot" style="background: ${color};"></span>
                            <span>${cat}</span>
                        </div>
                        <div class="legend-item-right">
                            ₹${amt.toLocaleString()} <span style="color:#64748b; font-weight:400; font-size:0.75rem; margin-left:4px;">${pct.toFixed(1)}%</span>
                        </div>
                    </div>
                `;
            }
        });

        chart.style.background = `conic-gradient(${gradientParts.join(', ')})`;
        legendEl.innerHTML = legendHTML;
    }

    function renderBarChart() {
        const canvas = $("billBarChartCanvas");
        if (!canvas || !window.Chart) return;

        if (barChartInstance) {
            barChartInstance.destroy();
        }

        const sortedBills = [...allBills].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 7);

        barChartInstance = new Chart(canvas.getContext("2d"), {
            type: 'bar',
            data: {
                labels: sortedBills.map(b => b.name.length > 10 ? b.name.substring(0, 10) + '...' : b.name),
                datasets: [{
                    label: 'Amount (₹)',
                    data: sortedBills.map(b => Number(b.amount) || 0),
                    backgroundColor: '#3b82f6',
                    hoverBackgroundColor: '#2563eb',
                    borderRadius: 6,
                    barThickness: 24
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `₹${context.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { size: 11 } }
                    },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            color: '#64748b',
                            font: { size: 11 },
                            callback: (value) => `₹${value >= 1000 ? value / 1000 + 'k' : value}`
                        }
                    }
                }
            }
        });
    }

    function renderExpenseHistory() {
        const tbody = $("expenseHistoryTableBody");
        if (!tbody) return;

        const categoryFilter = $("historyCategoryFilter")?.value || "ALL";
        const sortFilter = $("historySortFilter")?.value || "LATEST";

        let filtered = allBills.filter(b => {
            if (categoryFilter !== "ALL" && (b.category || "Bills") !== categoryFilter) {
                return false;
            }
            return true;
        });

        if (sortFilter === "HIGHEST") {
            filtered.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
        } else if (sortFilter === "LOWEST") {
            filtered.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
        } else {
            // LATEST
            filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 24px; color: #64748b;">No expenses recorded in this category.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        filtered.forEach(bill => {
            const statusInfo = getBillStatusInfo(bill);
            const icon = getCategoryIcon(bill.category);

            let formattedDate = bill.date || "N/A";
            try {
                if (bill.date) {
                    const d = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
                    if (!isNaN(d.getTime())) {
                        formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    }
                }
            } catch (e) {}

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="bill-name-cell">
                        <div class="bill-icon"><i data-lucide="${icon}"></i></div>
                        <div class="bill-name-text">
                            <strong>${bill.name}</strong>
                            <small>${bill.category || 'Bills'}</small>
                        </div>
                    </div>
                </td>
                <td class="bill-date-cell">${formattedDate}</td>
                <td class="bill-amount-cell">₹${Number(bill.amount || 0).toLocaleString()}</td>
                <td><span class="${statusInfo.badgeClass}">${statusInfo.label}</span></td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    $("historyCategoryFilter")?.addEventListener("change", renderExpenseHistory);
    $("historySortFilter")?.addEventListener("change", renderExpenseHistory);

    // Initial load
    fetchExpenses();
});