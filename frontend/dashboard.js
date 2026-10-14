/* ===============================
   🔐 1. DASHBOARD INITIALIZATION & AUTH
=============================== */
(async function initDashboard() {
    const token = localStorage.getItem('billmateToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Set initial from local storage
    if (document.getElementById('userName')) {
        document.getElementById('userName').textContent = localStorage.getItem('billmateUser') || 'User';
    }
    const avatar = document.getElementById('headerUserAvatar');
    if (avatar) {
        avatar.src = localStorage.getItem('billmateProfilePicture') || 'icons/user-avatar.png';
    }

    // Fetch latest user data from API
    if (window.fetchCurrentUser) {
        const user = await window.fetchCurrentUser();
        if (user) {
            const userNameDisplay = user.full_name || user.username || 'User';
            if (document.getElementById('userName')) {
                document.getElementById('userName').textContent = userNameDisplay;
            }
            if (document.getElementById('topUserName')) {
                document.getElementById('topUserName').textContent = userNameDisplay;
            }
            if (avatar) {
                avatar.src = user.profile_picture || 'icons/user-avatar.png';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => runDashboardLogic());
    } else {
        runDashboardLogic();
    }
})();

/* ===============================
   📊 2. MAIN DASHBOARD LOGIC
=============================== */
function runDashboardLogic() {
    const $ = id => document.getElementById(id);
    const BASE_URL = (typeof window.getBillmateApiBase === 'function')
        ? window.getBillmateApiBase()
        : (window.BILLMATE_API_BASE_URL || 'https://billmate-backend.onrender.com');
    const API_URL = `${BASE_URL}/api/bills`;
    
    // Load budget from localStorage or default to 50000
    const storedBudget = parseFloat(localStorage.getItem("userBudget"));
    let userBudget = (!isNaN(storedBudget) && isFinite(storedBudget) && storedBudget > 0) ? storedBudget : 50000;
    let bills = []; 
    let activeFilter = 'ALL'; // 'ALL' | 'UNPAID' | 'PAID'

    const getAuthHeaders = () => (typeof window.getBillmateAuthHeaders === 'function')
        ? window.getBillmateAuthHeaders()
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('billmateToken') || ''}`
        };

    function showConnectionError(msg) {
        const alertContainer = $("alert-container");
        if (!alertContainer) return;
        let banner = $("backend-conn-error");
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "backend-conn-error";
            banner.style.cssText = "background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:12px 16px; border-radius:10px; margin-bottom:18px; display:flex; align-items:center; gap:10px; font-size:0.9rem;";
            alertContainer.prepend(banner);
        }
        banner.innerHTML = `<span style="font-size:1.2rem;">⚠️</span> <span><strong>Connection Notice:</strong> ${msg}</span>`;
    }

    function clearConnectionError() {
        const banner = $("backend-conn-error");
        if (banner) banner.remove();
    }

    // Helper: Compute dynamic status label & styling
    function getBillStatusInfo(bill) {
        if (bill.status === 'Paid') {
            return { label: 'Paid', className: 'status-paid', color: '#10b981' };
        }
        if (!bill.date) {
            return { label: 'Unpaid', className: 'status-unpaid', color: '#F5A93B' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: `Overdue`, badgeClass: 'badge overdue', dateClass: 'bill-date-cell overdue', color: '#ef4444' };
        }
        if (diffDays === 0) {
            return { label: 'Due Today', badgeClass: 'badge due-soon', dateClass: 'bill-date-cell due-soon', color: '#f97316' };
        }
        if (diffDays <= 3) {
            return { label: `Due Soon`, badgeClass: 'badge due-soon', dateClass: 'bill-date-cell due-soon', color: '#f59e0b' };
        }
        return { label: 'Upcoming', badgeClass: 'badge upcoming', dateClass: 'bill-date-cell', color: '#3b82f6' };
    }

    // --- FETCH BILLS FROM DATABASE ---
    async function fetchBills() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                clearConnectionError();
                bills = await response.json();
                window.latestBills = bills; // Store globally for assistant
                updateDashboard();
            } else if (response.status === 401) {
                if (window.logoutBillmate) {
                    window.logoutBillmate('Your session has expired. Please log in again.');
                } else {
                    localStorage.removeItem('billmateToken');
                    window.location.href = 'login.html';
                }
            } else if (response.status === 503) {
                showConnectionError("Service is starting up. Please wait a few seconds...");
            } else {
                const errData = await response.json().catch(() => ({}));
                const msg = (window.extractApiErrorMessage && window.extractApiErrorMessage(errData)) || errData.error || errData.message || `Failed to fetch bills (${response.status}).`;
                console.error("Failed to fetch bills:", msg);
            }
        } catch (error) {
            console.error("Error fetching bills:", error);
            showConnectionError(`Cannot reach the BillMate server at <code>${BASE_URL}</code>. Please make sure the backend is running.`);
        }
    }

    // --- UPDATE UI CALCULATIONS ---
    function updateDashboard() {
        let totalPaid = 0, totalDue = 0;
        let expenses = { Rent: 0, Food: 0, Bills: 0, Utilities: 0, Subscription: 0, Other: 0 };

        bills.forEach(bill => {
            const amt = Number(bill.amount) || 0;
            if (bill.status === "Paid") {
                totalPaid += amt;
                const cat = bill.category || 'Bills';
                expenses[cat] = (expenses[cat] || 0) + amt;
            } else {
                totalDue += amt;
            }
        });

        const remaining = userBudget - totalPaid;
        const usedPercent = userBudget > 0 ? Math.round((totalPaid / userBudget) * 100) : 0;

        // Update Text Display
        if($("display-budget")) $("display-budget").innerText = `₹${userBudget.toLocaleString('en-IN')}`;
        if($("display-paid")) $("display-paid").innerText = `₹${totalPaid.toLocaleString('en-IN')}`;
        if($("display-due")) $("display-due").innerText = `₹${totalDue.toLocaleString('en-IN')}`;
        if($("display-balance")) $("display-balance").innerText = remaining < 0 
            ? `-₹${Math.abs(remaining).toLocaleString('en-IN')}` 
            : `₹${remaining.toLocaleString('en-IN')}`;

        // Budget Message & Warnings
        const msg = $("budget-msg");
        if(msg) {
            if (remaining < 0) {
                msg.innerText = `Exceeded by ₹${Math.abs(remaining).toLocaleString()}`;
                msg.style.color = "#ef4444";
            } else if (usedPercent >= 90) {
                msg.innerText = `${usedPercent}% used`;
                msg.style.color = "#f97316";
            } else {
                msg.innerText = "On track";
                msg.style.color = "#8b5cf6";
            }
        }

        // Budget Overview Card
        if($("budget-overview-total")) $("budget-overview-total").innerText = `₹${userBudget.toLocaleString('en-IN')}`;
        if($("budget-overview-spent")) $("budget-overview-spent").innerText = `₹${totalPaid.toLocaleString('en-IN')}`;
        if($("budget-overview-pct")) $("budget-overview-pct").innerText = `${usedPercent}%`;
        if($("budget-overview-remaining")) {
            $("budget-overview-remaining").innerText = remaining < 0 
                ? `-₹${Math.abs(remaining).toLocaleString('en-IN')}` 
                : `₹${remaining.toLocaleString('en-IN')}`;
            $("budget-overview-remaining").style.color = remaining < 0 ? "#ef4444" : "#22c55e";
        }

        // Progress Bar
        let pctClamped = Math.min(usedPercent, 100);
        if($("budget-progress")) {
            $("budget-progress").style.width = pctClamped + "%";
            if (usedPercent > 100) {
                $("budget-progress").style.backgroundColor = "#ef4444";
            } else if (usedPercent >= 85) {
                $("budget-progress").style.backgroundColor = "#f97316";
            } else {
                $("budget-progress").style.backgroundColor = "#10b981";
            }
        }
        if($("percent-used")) $("percent-used").innerText = usedPercent + "%";

        updateChart(expenses, totalPaid);
        renderBills();
        checkUpcomingBills(); // Triggers Visual and Email alerts
    }

    // --- RENDER BILLS LIST WITH FILTERS ---
    function renderBills() {
        const tbody = $("bill-table-body");
        if(!tbody) return;

        let filtered = bills;
        if (activeFilter === 'UNPAID') {
            filtered = bills.filter(b => b.status !== 'Paid');
        } else if (activeFilter === 'PAID') {
            filtered = bills.filter(b => b.status === 'Paid');
        }

        tbody.innerHTML = filtered.length ? "" : "<tr><td colspan='5' style='text-align:center; padding: 24px; color: #64748b;'>No bills found.</td></tr>";

        filtered.slice().reverse().forEach(bill => {
            const id = bill._id && bill._id.$oid ? bill._id.$oid : bill._id;
            const statusInfo = getBillStatusInfo(bill);
            const isPaid = bill.status === "Paid";
            const badgeClass = isPaid ? 'badge paid' : statusInfo.badgeClass;
            const badgeLabel = isPaid ? 'Paid' : statusInfo.label;
            const dateClass = isPaid ? 'bill-date-cell' : statusInfo.dateClass;
            
            // Map category to icon roughly
            let iconName = 'receipt';
            if (bill.category === 'Rent') iconName = 'home';
            if (bill.category === 'Utilities' || bill.category === 'Electricity') iconName = 'zap';
            if (bill.category === 'Internet' || bill.category === 'Subscription') iconName = 'wifi';
            if (bill.category === 'Food' || bill.category === 'Food & Dining') iconName = 'shopping-cart';

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="bill-name-cell">
                        <div class="bill-icon"><i data-lucide="${iconName}" style="width:18px; height:18px;"></i></div>
                        <div class="bill-name-text">
                            <strong>${bill.name}</strong>
                            <small>${bill.category || 'Bills'}</small>
                        </div>
                    </div>
                </td>
                <td class="${dateClass}">
                    ${bill.date || 'N/A'}<br>
                    ${!isPaid && statusInfo.label !== 'Upcoming' ? `<small style="font-size:0.7rem;">${statusInfo.label}</small>` : ''}
                </td>
                <td class="bill-amount-cell">₹${Number(bill.amount || 0).toLocaleString()}</td>
                <td><span class="${badgeClass}">${badgeLabel}</span></td>
                <td>
                    <div class="bill-actions">
                        <button class="btn-icon" onclick="toggleBill('${id}')" title="${isPaid ? 'Mark Unpaid' : 'Mark Paid'}">
                            <i data-lucide="${isPaid ? 'x' : 'check'}" style="width:16px; height:16px; color: ${isPaid ? '#64748b' : '#22c55e'}"></i>
                        </button>
                        <button class="btn-icon" onclick="openEditModal('${id}')" title="Edit">
                            <i data-lucide="edit-2" style="width:16px; height:16px;"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteBill('${id}')" title="Delete">
                            <i data-lucide="trash-2" style="width:16px; height:16px; color: #ef4444;"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Render Mini Upcoming Bills list
        const miniList = $("upcoming-bills-mini-list");
        if(miniList) {
            const upcoming = bills.filter(b => b.status !== 'Paid').slice(0, 3);
            miniList.innerHTML = upcoming.length ? "" : "<p style='color:#64748b; font-size:0.85rem;'>No upcoming bills.</p>";
            upcoming.forEach(bill => {
                const statusInfo = getBillStatusInfo(bill);
                let iconName = 'zap';
                if (bill.category === 'Rent') iconName = 'home';
                else if (bill.category === 'Food') iconName = 'shopping-cart';
                
                miniList.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="bill-name-cell">
                        <div class="bill-icon" style="background:#fff7ed; color:#f97316; width:32px; height:32px;"><i data-lucide="${iconName}" style="width:16px; height:16px;"></i></div>
                        <div class="bill-name-text">
                            <strong>${bill.name}</strong>
                            <small>${statusInfo.label}</small>
                        </div>
                    </div>
                    <div class="bill-amount-cell">₹${Number(bill.amount || 0).toLocaleString()}</div>
                </div>`;
            });
        }
        
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // Filter Button Handlers
    function updateFilterStyles(activeId) {
        ["filterAllBills", "filterUnpaidBills", "filterPaidBills"].forEach(id => {
            const btn = $(id);
            if(btn) {
                if (id === activeId) {
                    btn.style.background = "#eff6ff";
                    btn.style.color = "#2563eb";
                    btn.style.border = "1px solid #bfdbfe";
                } else {
                    btn.style.background = "transparent";
                    btn.style.color = "#64748b";
                    btn.style.border = "none";
                }
            }
        });
    }

    $("filterAllBills")?.addEventListener("click", () => { activeFilter = 'ALL'; updateFilterStyles("filterAllBills"); renderBills(); });
    $("filterUnpaidBills")?.addEventListener("click", () => { activeFilter = 'UNPAID'; updateFilterStyles("filterUnpaidBills"); renderBills(); });
    $("filterPaidBills")?.addEventListener("click", () => { activeFilter = 'PAID'; updateFilterStyles("filterPaidBills"); renderBills(); });

    // --- ADD BILL BUTTON SMOOTH NAVIGATION & HIGHLIGHT ---
    function scrollToAndFocusAddBill() {
        const formCard = $("add-bill-form")?.closest('.card') || $("add-bill-form");
        const billNameInput = $("bill-name");
        if (!formCard || !billNameInput) return;

        const header = document.querySelector('.top-header');
        const headerOffset = header ? header.offsetHeight + 24 : 80;
        const rect = formCard.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = Math.max(0, rect.top + scrollTop - headerOffset);

        window.scrollTo({
            top: targetY,
            behavior: 'smooth'
        });

        formCard.classList.remove('highlight-pulse');
        void formCard.offsetWidth; // Trigger reflow for animation restart
        formCard.classList.add('highlight-pulse');

        setTimeout(() => {
            billNameInput.focus();
            billNameInput.select?.();
        }, 380);
    }

    $("openAddBillModalBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToAndFocusAddBill();
    });

    $("sidebarUploadBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToAndFocusAddBill();
    });

    // --- BUDGET MODAL LOGIC ---
    const budgetModal = $("budgetModal");
    const openBudgetBtn = $("openBudgetBtn");
    const closeBudgetBtn = $("closeBudgetBtn");
    const saveBudgetBtn = $("saveBudgetBtn");
    const budgetInput = $("new-budget-input");

    if (openBudgetBtn) {
        openBudgetBtn.onclick = (e) => {
            e.preventDefault();
            if (budgetInput) budgetInput.value = userBudget; 
            if (budgetModal) budgetModal.style.display = "flex"; 
        };
    }

    if (closeBudgetBtn) {
        closeBudgetBtn.onclick = () => { if (budgetModal) budgetModal.style.display = "none"; };
    }

    if (saveBudgetBtn) {
        saveBudgetBtn.onclick = () => {
            const raw = budgetInput ? String(budgetInput.value).trim() : '';
            const val = parseFloat(raw);
            if (!isNaN(val) && isFinite(val) && val > 0) {
                userBudget = val;
                localStorage.setItem("userBudget", String(val));
                try {
                    const rawSettings = JSON.parse(localStorage.getItem("userSettings") || "{}");
                    rawSettings.budget = val;
                    localStorage.setItem("userSettings", JSON.stringify(rawSettings));
                } catch (_) {}
                updateDashboard();
                if (budgetModal) budgetModal.style.display = "none";
            } else {
                alert("Please enter a valid monthly budget greater than ₹0.");
            }
        };
    }

    // --- EDIT BILL MODAL LOGIC ---
    const editModal = $("editBillModal");
    const editForm = $("edit-bill-form");

    window.openEditModal = (id) => {
        const bill = bills.find(b => (b._id && b._id.$oid ? b._id.$oid : b._id) === id);
        if (!bill) return;

        $("edit-bill-id").value = id;
        $("edit-bill-name").value = bill.name || "";
        $("edit-bill-amount").value = bill.amount || "";
        $("edit-bill-date").value = bill.date || "";
        $("edit-bill-category").value = bill.category || "Bills";

        if (editModal) editModal.classList.add("active");
    };

    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = $("edit-bill-id").value;
            const name = $("edit-bill-name").value.trim();
            const amount = Number($("edit-bill-amount").value);
            const date = $("edit-bill-date").value;
            const category = $("edit-bill-category").value;

            if (!name || isNaN(amount) || amount <= 0 || !date) {
                alert("Please fill all fields with valid values.");
                return;
            }

            const submitBtn = editForm.querySelector('button[type="submit"]');
            const origText = submitBtn ? submitBtn.innerText : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Saving...';
            }

            try {
                const res = await fetch(`${API_URL}/${id}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ name, amount, date, category })
                });

                if (res.ok) {
                    if (editModal) editModal.classList.remove("active");
                    await fetchBills();
                } else if (res.status === 401) {
                    alert("Your session has expired. Please log in again.");
                    if (window.logoutBillmate) {
                        window.logoutBillmate('Your session has expired. Please log in again.');
                    } else {
                        localStorage.removeItem('billmateToken');
                        window.location.href = 'login.html';
                    }
                } else {
                    const errData = await res.json().catch(() => ({}));
                    const msg = (window.extractApiErrorMessage && window.extractApiErrorMessage(errData)) || errData.error || errData.message || `Failed to update bill (${res.status}).`;
                    alert(msg);
                }
            } catch (err) {
                console.error("Edit bill error:", err);
                alert(`Cannot reach BillMate server at ${BASE_URL}. Please check your connection.`);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = origText;
                }
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
            if (bill.status !== "Paid" && bill.date) {
                const dueDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((dueDate - today) / 86400000);
                
                let alertMsg = "";
                if (diffDays === 0) alertMsg = `🚨 ${bill.name} (₹${bill.amount}) is due TODAY!`;
                else if (diffDays < 0) alertMsg = `⚠️ ${bill.name} (₹${bill.amount}) is OVERDUE by ${Math.abs(diffDays)} day(s)!`;
                else if (diffDays <= 3) alertMsg = `⏰ ${bill.name} (₹${bill.amount}) is due in ${diffDays} day(s).`;

                if (alertMsg) {
                    emailAlerts.push(alertMsg);
                    
                    const div = document.createElement("div");
                    div.className = diffDays < 0 ? "alert-banner overdue" : "alert-banner";
                    div.innerHTML = `<span>${alertMsg}</span>`;
                    alertContainer.appendChild(div);
                }
            }
        });

        // Trigger backend email alert if configured and not sent in this session
        const userEmail = localStorage.getItem('billmateEmail');
        if (emailAlerts.length > 0 && userEmail && !sessionStorage.getItem('emailAlertSent')) {
            try {
                await fetch(`${BASE_URL}/api/bills/send-immediate-alert`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ email: userEmail, alerts: emailAlerts })
                });
                sessionStorage.setItem('emailAlertSent', 'true');
            } catch (err) {
                console.warn("Immediate alert notification failed:", err.message);
            }
        }
    }

    // --- FORM SUBMIT: ADD BILL ---
    if($("add-bill-form")){
        $("add-bill-form").onsubmit = async (e) => {
            e.preventDefault();
            const name = $("bill-name").value.trim();
            const amount = Number($("bill-amount").value);
            const category = $("bill-category").value;
            const date = $("bill-date").value;

            if (!name) {
                alert("Please enter a bill name.");
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                alert("Bill amount must be greater than ₹0.");
                return;
            }
            if (!date) {
                alert("Please select a due date.");
                return;
            }

            const submitBtn = $("add-bill-form").querySelector('button[type="submit"]');
            const origHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Adding...';
            }

            const newBill = { name, amount, category, date, status: "Unpaid" };
            try {
                const response = await fetch(API_URL, { 
                    method: 'POST', 
                    headers: getAuthHeaders(), 
                    body: JSON.stringify(newBill) 
                });
                if (response.ok) { 
                    clearConnectionError();
                    e.target.reset(); 
                    await fetchBills(); 
                    if (window.refreshBillmateNotifications) {
                        window.refreshBillmateNotifications();
                    }
                } else if (response.status === 401) {
                    alert("Your session has expired. Please log in again.");
                    if (window.logoutBillmate) {
                        window.logoutBillmate('Your session has expired. Please log in again.');
                    } else {
                        localStorage.removeItem('billmateToken');
                        window.location.href = 'login.html';
                    }
                } else {
                    const errData = await response.json().catch(() => ({}));
                    const msg = (window.extractApiErrorMessage && window.extractApiErrorMessage(errData)) 
                        || errData.error || errData.message || errData.msg 
                        || `Failed to add bill (${response.status}).`;
                    alert(msg);
                }
            } catch (err) {
                console.error("Add bill network error:", err);
                alert(`Cannot reach BillMate server at ${BASE_URL}. Please verify the backend is running.`);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = origHtml;
                    if (window.lucide) lucide.createIcons();
                }
            }
        };
    }

    // --- GLOBAL ACTIONS ---
    window.toggleBill = async (id) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, { method: 'PUT', headers: getAuthHeaders() });
            if (res.ok) {
                await fetchBills();
                if (window.refreshBillmateNotifications) {
                    window.refreshBillmateNotifications();
                }
            } else if (res.status === 401) {
                window.logoutBillmate ? window.logoutBillmate('Your session has expired. Please log in again.') : window.location.href = 'login.html';
            }
        } catch (err) {
            console.error("Toggle bill error:", err);
        }
    };

    window.deleteBill = async (id) => {
        if (!confirm("Are you sure you want to delete this bill?")) return;
        try {
            const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (res.ok) {
                await fetchBills();
            } else if (res.status === 401) {
                window.logoutBillmate ? window.logoutBillmate('Your session has expired. Please log in again.') : window.location.href = 'login.html';
            }
        } catch (err) {
            console.error("Delete bill error:", err);
        }
    };

    // --- CHART UPDATE ---
    function updateChart(exp, totalPaid) {
        const chart = $("expenses-chart");
        if (!chart) return;

        const total = Object.values(exp).reduce((sum, v) => sum + v, 0);
        
        if ($("pie-chart-total")) {
            $("pie-chart-total").innerText = `₹${total.toLocaleString()}`;
        }

        if (total === 0) {
            chart.style.background = "conic-gradient(#f1f5f9 0% 100%)";
            if($("pie-legend")) $("pie-legend").innerHTML = "<p style='color:#64748b; font-size:0.85rem;'>No spending data.</p>";
            return;
        }

        // Map categories dynamically for pie chart
        const colors = {
            Rent: '#3b82f6', // blue
            Utilities: '#22c55e', // green
            Food: '#facc15', // yellow
            Entertainment: '#ef4444', // red
            Other: '#a855f7', // purple
            Bills: '#f97316' // orange
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
                            ${cat}
                        </div>
                        <div class="legend-item-right">
                            ₹${amt.toLocaleString()} <span style="color:#64748b; font-weight:400; font-size:0.75rem; margin-left:4px;">${pct.toFixed(1)}%</span>
                        </div>
                    </div>
                `;
            }
        });

        chart.style.background = `conic-gradient(${gradientParts.join(', ')})`;
        if($("pie-legend")) $("pie-legend").innerHTML = legendHTML;
    }

    // LOGOUT
    if($("logoutBtn")) {
        $("logoutBtn").onclick = () => {
            if (window.logoutBillmate) {
                window.logoutBillmate();
            } else {
                localStorage.removeItem('billmateToken');
                localStorage.removeItem('billmateUser');
                localStorage.removeItem('billmateEmail');
                localStorage.removeItem('billmateProfilePicture');
                window.location.href = "login.html";
            }
        };
    }

    // Initial load
    fetchBills();
}