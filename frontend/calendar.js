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
    
    // State
    let currentDate = new Date();
    let bills = []; 
    let activeView = 'MONTH'; // 'MONTH' | 'WEEK' | 'LIST'
    let selectedBill = null;

    const getAuthHeaders = () => (typeof window.getBillmateAuthHeaders === 'function')
        ? window.getBillmateAuthHeaders()
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('billmateToken') || ''}`
        };

    /* ===============================
       📥 2. FETCH DATA FROM API
    =============================== */
    async function fetchAndRender() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                bills = await response.json();
                renderView();
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
            return { label: 'Paid', tagClass: 'paid', badgeClass: 'badge paid' };
        }
        if (!bill.date) {
            return { label: 'Unpaid', tagClass: 'upcoming', badgeClass: 'badge upcoming' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: 'Overdue', tagClass: 'overdue', badgeClass: 'badge overdue' };
        }
        if (diffDays <= 3) {
            return { label: 'Due Soon', tagClass: 'due-soon', badgeClass: 'badge due-soon' };
        }
        return { label: 'Upcoming', tagClass: 'upcoming', badgeClass: 'badge upcoming' };
    }

    /* ===============================
       📅 3. RENDER FUNCTION
    =============================== */
    function renderView() {
        if (activeView === 'LIST') {
            renderList();
        } else {
            renderMonth();
        }
    }

    function renderMonth() {
        const calendarCard = $("calendarCard");
        const calendarGrid = $("calendarGrid");
        const monthDisplay = $("monthDisplay");
        const listView = $("calendarListView");

        if (calendarCard) calendarCard.style.display = "block";
        if (listView) listView.style.display = "none";
        if (!calendarGrid) return;
        
        calendarGrid.innerHTML = "";
        
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDate);
        if (monthDisplay) monthDisplay.innerText = `${monthName} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Generate Empty Slots for days of previous month
        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement("div");
            emptyDiv.className = "calendar-day empty";
            calendarGrid.appendChild(emptyDiv);
        }

        // Generate Days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayDiv = document.createElement("div");
            dayDiv.className = "calendar-day";
            
            // Format current calendar cell date for comparison
            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            dayDiv.innerHTML = `<span class="day-number">${day}</span>`;

            // Filter bills for this specific day
            const billsDue = bills.filter(b => {
                if (!b.date) return false;
                const billDate = b.date.split('T')[0]; 
                return billDate === cellDateStr;
            });
            
            billsDue.forEach(bill => {
                const statusInfo = getBillStatusInfo(bill);
                const billTag = document.createElement("div");
                billTag.className = `calendar-bill-tag ${statusInfo.tagClass}`;
                billTag.innerHTML = `<span>${bill.name} ₹${Number(bill.amount || 0).toLocaleString()}</span>`;
                billTag.onclick = (e) => {
                    e.stopPropagation();
                    openBillModal(bill);
                };
                dayDiv.appendChild(billTag);
            });

            // Highlight Today
            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayDiv.classList.add("today");
            }

            calendarGrid.appendChild(dayDiv);
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function renderList() {
        const calendarCard = $("calendarCard");
        const listView = $("calendarListView");
        const listBody = $("calendarListBody");
        const monthDisplay = $("monthDisplay");

        if (calendarCard) calendarCard.style.display = "none";
        if (listView) listView.style.display = "block";
        if (!listBody) return;

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

        const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDate);
        if (monthDisplay) monthDisplay.innerText = `${monthName} ${year}`;

        const monthBills = bills.filter(b => b.date && b.date.startsWith(monthStr));

        if (monthBills.length === 0) {
            listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 28px; color: #64748b;">No bills found for ${monthName} ${year}.</td></tr>`;
            return;
        }

        listBody.innerHTML = "";
        monthBills.forEach(bill => {
            const statusInfo = getBillStatusInfo(bill);
            const isPaid = bill.status === "Paid";
            const id = bill._id && bill._id.$oid ? bill._id.$oid : bill._id;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="bill-name-cell">
                        <div class="bill-icon"><i data-lucide="receipt"></i></div>
                        <div class="bill-name-text">
                            <strong>${bill.name}</strong>
                            <small>${bill.category || 'Bills'}</small>
                        </div>
                    </div>
                </td>
                <td class="bill-date-cell">${bill.date || 'N/A'}</td>
                <td class="bill-amount-cell">₹${Number(bill.amount || 0).toLocaleString()}</td>
                <td><span class="${statusInfo.badgeClass}">${statusInfo.label}</span></td>
                <td>
                    <div class="bill-actions">
                        <button class="btn-icon" onclick="toggleCalendarBill('${id}')" title="${isPaid ? 'Mark Unpaid' : 'Mark Paid'}">
                            <i data-lucide="${isPaid ? 'x' : 'check'}" style="color: ${isPaid ? '#64748b' : '#22c55e'}"></i>
                        </button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    /* ===============================
       🔍 4. BILL DETAIL MODAL
    =============================== */
    function openBillModal(bill) {
        selectedBill = bill;
        const modal = $("billDetailModal");
        if (!modal) return;

        const statusInfo = getBillStatusInfo(bill);
        const isPaid = bill.status === 'Paid';

        if ($("modalBillTitle")) $("modalBillTitle").textContent = bill.name;
        if ($("modalBillCategory")) $("modalBillCategory").textContent = bill.category || "Bills";
        if ($("modalBillDate")) $("modalBillDate").textContent = bill.date || "N/A";
        if ($("modalBillAmount")) $("modalBillAmount").textContent = `₹${Number(bill.amount || 0).toLocaleString()}`;
        
        const badge = $("modalBillStatusBadge");
        if (badge) {
            badge.className = statusInfo.badgeClass;
            badge.textContent = statusInfo.label;
        }

        const toggleBtn = $("modalTogglePaidBtn");
        if (toggleBtn) {
            toggleBtn.textContent = isPaid ? "Mark as Unpaid" : "Mark as Paid";
            toggleBtn.onclick = () => {
                const id = bill._id && bill._id.$oid ? bill._id.$oid : bill._id;
                toggleCalendarBill(id);
                modal.classList.remove("active");
            };
        }

        const deleteBtn = $("modalDeleteBtn");
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm(`Are you sure you want to delete "${bill.name}"?`)) {
                    const id = bill._id && bill._id.$oid ? bill._id.$oid : bill._id;
                    await deleteCalendarBill(id);
                    modal.classList.remove("active");
                }
            };
        }

        modal.classList.add("active");
    }

    window.toggleCalendarBill = async (id) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                fetchAndRender();
            }
        } catch (e) {
            console.error("Toggle error:", e);
        }
    };

    window.deleteCalendarBill = async (id) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                fetchAndRender();
            }
        } catch (e) {
            console.error("Delete error:", e);
        }
    };

    /* ===============================
       🕹️ 5. CONTROLS & NAVIGATION
    =============================== */
    if ($("prevMonth")) {
        $("prevMonth").onclick = () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderView();
        };
    }

    if ($("nextMonth")) {
        $("nextMonth").onclick = () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderView();
        };
    }

    if ($("todayBtn")) {
        $("todayBtn").onclick = () => {
            currentDate = new Date();
            renderView();
        };
    }

    // View toggles
    function setView(view, activeBtnId) {
        activeView = view;
        ["viewMonthBtn", "viewWeekBtn", "viewListBtn"].forEach(id => {
            const btn = $(id);
            if (btn) btn.classList.toggle("active", id === activeBtnId);
        });
        renderView();
    }

    if ($("viewMonthBtn")) $("viewMonthBtn").onclick = () => setView('MONTH', 'viewMonthBtn');
    if ($("viewWeekBtn")) $("viewWeekBtn").onclick = () => setView('MONTH', 'viewWeekBtn'); // fallback to month for week
    if ($("viewListBtn")) $("viewListBtn").onclick = () => setView('LIST', 'viewListBtn');

    // Initial Load
    fetchAndRender();
});