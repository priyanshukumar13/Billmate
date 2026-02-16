/* ===============================
   🔐 1. IMMEDIATE AUTH CHECK
=============================== */
(async function initDashboard() {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    let apiUser = null;
    try {
        if (typeof verifyAuthOrRedirect === 'function') {
            const user = await verifyAuthOrRedirect();
            if (!user) throw new Error("Invalid token");
            apiUser = user;
            
            if (apiUser && apiUser.username) {
               if(document.getElementById('userName')) document.getElementById('userName').textContent = apiUser.username;
               if (apiUser.email) localStorage.setItem('billmateUser', apiUser.email);
            }
        }
    } catch (err) {
        console.error('Auth verification failed:', err);
        localStorage.removeItem('authToken');
        window.location.href = 'login.html';
        return;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => runDashboardLogic(apiUser));
    } else {
        runDashboardLogic(apiUser);
    }
})();

/* ===============================
   📊 2. MAIN DASHBOARD LOGIC
=============================== */
function runDashboardLogic(apiUser) {
    const $ = id => document.getElementById(id);
    const API_URL = "https://billmate-backend.onrender.com/api/bills";
    
    // Load budget from localStorage or default to 20000
    let userBudget = Number(localStorage.getItem("userBudget")) || 20000;
    let bills = []; 

    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    });

    // --- FETCH BILLS FROM DATABASE ---
    async function fetchBills() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                bills = await response.json();
                updateDashboard();
            }
        } catch (error) {
            console.error("Error fetching bills:", error);
        }
    }

    // --- UPDATE UI CALCULATIONS ---
    function updateDashboard() {
        let totalPaid = 0, totalDue = 0;
        let expenses = { Rent: 0, Food: 0, Bills: 0, Other: 0 };

        bills.forEach(bill => {
            const amt = Number(bill.amount);
            if (bill.status === "Paid") {
                totalPaid += amt;
                expenses[bill.category] = (expenses[bill.category] || 0) + amt;
            } else {
                totalDue += amt;
            }
        });

        const remaining = userBudget - totalPaid;

        // Update Text Display
        if($("display-budget")) $("display-budget").innerText = `₹${userBudget}`;
        if($("display-paid")) $("display-paid").innerText = `₹${totalPaid}`;
        if($("display-due")) $("display-due").innerText = `₹${totalDue}`;
        if($("display-balance")) $("display-balance").innerText = `₹${remaining}`;

        // Budget Message
        const msg = $("budget-msg");
        if(msg) {
            msg.innerText = remaining < 0 ? "Over Budget! ⚠️" : "Within Budget ✅";
            msg.style.color = remaining < 0 ? "#ef4444" : "#10b981";
        }

        // Progress Bar
        let pct = userBudget ? Math.min((totalPaid / userBudget) * 100, 100) : 0;
        if($("budget-progress")) $("budget-progress").style.width = pct + "%";
        if($("percent-used")) $("percent-used").innerText = Math.round(pct) + "%";

        updateChart(expenses, totalPaid + totalDue);
        renderBills();
        checkUpcomingBills(); // Triggers Visual and Email alerts
    }

    // --- RENDER RECENT TRANSACTIONS ---
    function renderBills() {
        const list = $("bill-list");
        if(!list) return;

        list.innerHTML = bills.length ? "" : "<p style='padding:20px;color:#64748b;'>No transactions.</p>";

        bills.slice().reverse().forEach(bill => {
            const li = document.createElement("li");
            li.className = "bill-item";
            li.innerHTML = `
                <div class="bill-info">
                    <strong>${bill.name}</strong><br>
                    <small>${bill.date}</small>
                </div>
                <div class="bill-actions">
                    <strong>₹${bill.amount}</strong>
                    <button class="btn-status ${bill.status === "Paid" ? "paid" : ""}"
                        onclick="toggleBill('${bill._id}')">
                        ${bill.status === "Paid" ? "Paid" : "Pay"}
                    </button>
                    <button class="btn-delete" onclick="deleteBill('${bill._id}')">🗑️</button>
                </div>`;
            list.appendChild(li);
        });
    }

    // --- BUDGET MODAL LOGIC (FIX FOR SET BUDGET BUTTON) ---
    const budgetModal = $("budgetModal");
    const openBudgetBtn = $("openBudgetBtn");
    const closeBudgetBtn = $("closeBudgetBtn");
    const saveBudgetBtn = $("saveBudgetBtn");
    const budgetInput = $("new-budget-input");

    if (openBudgetBtn) {
        openBudgetBtn.onclick = () => {
            budgetInput.value = userBudget; 
            budgetModal.style.display = "flex"; 
        };
    }

    if (closeBudgetBtn) {
        closeBudgetBtn.onclick = () => budgetModal.style.display = "none";
    }

    if (saveBudgetBtn) {
        saveBudgetBtn.onclick = () => {
            const val = Number(budgetInput.value);
            if (val > 0) {
                userBudget = val;
                localStorage.setItem("userBudget", val);
                updateDashboard();
                budgetModal.style.display = "none";
            } else {
                alert("Please enter a valid amount.");
            }
        };
    }

    // --- ALERTS LOGIC (VISUAL + EMAIL TRIGGER) ---
    async function checkUpcomingBills() {
        const alertContainer = $("alert-container");
        if(!alertContainer) return;
        alertContainer.innerHTML = "";
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let emailAlerts = []; 

        bills.forEach(bill => {
            if (bill.status === "Unpaid" && bill.date) {
                const dueDate = new Date(bill.date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((dueDate - today) / 86400000);
                
                let alertMsg = "";
                if (diffDays === 0) alertMsg = `🚨 ${bill.name} is due TODAY!`;
                else if (diffDays < 0) alertMsg = `⚠️ ${bill.name} is OVERDUE!`;

                if (alertMsg) {
                    emailAlerts.push(alertMsg);
                    
                    const div = document.createElement("div");
                    div.className = diffDays < 0 ? "alert-banner overdue" : "alert-banner";
                    div.innerHTML = `<span>${alertMsg}</span>`;
                    alertContainer.appendChild(div);
                }
            }
        });

        // Send Email if alerts exist and haven't been sent this session
        const userEmail = localStorage.getItem('billmateUser'); 
        if (emailAlerts.length > 0 && userEmail && !sessionStorage.getItem('emailSent')) {
            try {
                await fetch("https://billmate-backend.onrender.com/api/bills/send-immediate-alert", {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ email: userEmail, alerts: emailAlerts })
                });
                sessionStorage.setItem('emailSent', 'true');
            } catch (err) {
                console.error("Failed to trigger email alert.");
            }
        }
    }

    // --- FORM SUBMIT: ADD BILL ---
    if($("add-bill-form")){
        $("add-bill-form").onsubmit = async (e) => {
            e.preventDefault();
            const newBill = {
                name: $("bill-name").value,
                amount: Number($("bill-amount").value),
                category: $("bill-category").value,
                date: $("bill-date").value,
                status: "Unpaid"
            };
            const response = await fetch(API_URL, { 
                method: 'POST', 
                headers: getAuthHeaders(), 
                body: JSON.stringify(newBill) 
            });
            if (response.ok) { e.target.reset(); fetchBills(); }
        };
    }

    // --- GLOBAL WINDOW ACTIONS ---
    window.toggleBill = async (id) => {
        const res = await fetch(`${API_URL}/${id}`, { method: 'PUT', headers: getAuthHeaders() });
        if (res.ok) fetchBills();
    };

    window.deleteBill = async (id) => {
        if (!confirm("Delete this bill?")) return;
        const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        if (res.ok) fetchBills();
    };

    // --- CHART UPDATE ---
    function updateChart(exp, total) {
        const chart = $("expenses-chart");
        if (!chart || total === 0) {
            if(chart) chart.style.background = "#e2e8f0";
            return;
        }
        let p1 = (exp.Rent / total) * 100;
        let p2 = p1 + (exp.Food / total) * 100;
        let p3 = p2 + (exp.Bills / total) * 100;
        chart.style.background = `conic-gradient(#3b82f6 0% ${p1}%, #ef4444 ${p1}% ${p2}%, #f59e0b ${p2}% ${p3}%, #10b981 ${p3}% 100%)`;
    }

    // LOGOUT
    if($("logoutBtn")) $("logoutBtn").onclick = () => { localStorage.clear(); window.location.href = "login.html"; };

    // Initial load
    fetchBills();
}