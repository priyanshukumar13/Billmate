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

    let bills = [];
    let activeFilter = 'ALL'; // 'ALL' | 'UNPAID' | 'PAID' | 'OVERDUE'

    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    });

    /* ===============================
       📥 2. FETCH BILLS FROM API
    =============================== */
    async function fetchBills() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                bills = await response.json();
                populateMonthFilter();
                renderBills();
            } else if (response.status === 401) {
                window.logoutBillmate ? window.logoutBillmate() : window.location.href = 'login.html';
            } else {
                console.error("Failed to fetch bills. Status:", response.status);
            }
        } catch (error) {
            console.error("Error connecting to API:", error);
        }
    }

    /* ===============================
       🏷️ 3. STATUS & RELATIVE TIME
    =============================== */
    function getBillStatusInfo(bill) {
        if (bill.status === 'Paid') {
            const paidDateStr = bill.paidDate ? new Date(bill.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return {
                label: 'Paid',
                badgeClass: 'badge paid',
                relativeText: paidDateStr ? `Paid on ${paidDateStr}` : 'Paid'
            };
        }
        if (!bill.date) {
            return { label: 'Unpaid', badgeClass: 'badge upcoming', relativeText: '' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return {
                label: 'Overdue',
                badgeClass: 'badge overdue',
                relativeText: `Overdue by ${Math.abs(diffDays)}d`
            };
        }
        if (diffDays === 0) {
            return {
                label: 'Due Today',
                badgeClass: 'badge due-today',
                relativeText: 'Due Today'
            };
        }
        if (diffDays === 1) {
            return {
                label: 'Due Soon',
                badgeClass: 'badge due-soon',
                relativeText: 'Due Tomorrow'
            };
        }
        if (diffDays <= 5) {
            return {
                label: 'Due Soon',
                badgeClass: 'badge due-soon',
                relativeText: `in ${diffDays} days`
            };
        }
        return {
            label: 'Upcoming',
            badgeClass: 'badge upcoming',
            relativeText: `in ${diffDays} days`
        };
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

    function populateMonthFilter() {
        const monthSelect = $("billMonthFilter");
        if (!monthSelect) return;
        
        const monthsSet = new Set();
        bills.forEach(b => {
            if (b.date && b.date.length >= 7) {
                monthsSet.add(b.date.substring(0, 7)); // YYYY-MM
            }
        });

        const currentOptions = Array.from(monthSelect.options).map(o => o.value);
        monthsSet.forEach(m => {
            if (!currentOptions.includes(m)) {
                const opt = document.createElement("option");
                opt.value = m;
                const d = new Date(m + "-01T00:00:00");
                opt.textContent = isNaN(d.getTime()) ? m : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                monthSelect.appendChild(opt);
            }
        });
    }

    /* ===============================
       📋 4. RENDER BILLS
    =============================== */
    function renderBills() {
        const tbody = $("billsTableBody");
        if (!tbody) return;

        const searchQuery = ($("billSearchInput")?.value || "").toLowerCase().trim();
        const categoryFilter = $("billCategoryFilter")?.value || "ALL";
        const monthFilter = $("billMonthFilter")?.value || "ALL";

        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let filtered = bills.filter(bill => {
            const statusInfo = getBillStatusInfo(bill);

            // Tab status filter
            if (activeFilter === 'UNPAID' && bill.status === 'Paid') return false;
            if (activeFilter === 'PAID' && bill.status !== 'Paid') return false;
            if (activeFilter === 'OVERDUE' && statusInfo.label !== 'Overdue') return false;

            // Search filter
            if (searchQuery) {
                const nameMatch = bill.name && bill.name.toLowerCase().includes(searchQuery);
                const catMatch = bill.category && bill.category.toLowerCase().includes(searchQuery);
                if (!nameMatch && !catMatch) return false;
            }

            // Category filter
            if (categoryFilter !== 'ALL') {
                if ((bill.category || 'Bills') !== categoryFilter) return false;
            }

            // Month filter
            if (monthFilter === 'THIS_MONTH') {
                if (!bill.date || !bill.date.startsWith(currentMonthStr)) return false;
            } else if (monthFilter !== 'ALL') {
                if (!bill.date || !bill.date.startsWith(monthFilter)) return false;
            }

            return true;
        });

        if ($("billsCountSummary")) {
            $("billsCountSummary").textContent = `Showing 1 to ${filtered.length} of ${bills.length} bills`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 28px; color: #64748b;">No matching bills found.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        filtered.forEach(bill => {
            const id = bill._id && bill._id.$oid ? bill._id.$oid : bill._id;
            const statusInfo = getBillStatusInfo(bill);
            const isPaid = bill.status === "Paid";
            const icon = getCategoryIcon(bill.category);

            // Format Due Date cleanly
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
                <td class="bill-date-cell">
                    ${formattedDate}
                    ${statusInfo.relativeText ? `<small>${statusInfo.relativeText}</small>` : ''}
                </td>
                <td class="bill-amount-cell">₹${Number(bill.amount || 0).toLocaleString()}</td>
                <td><span class="${statusInfo.badgeClass}">${statusInfo.label}</span></td>
                <td>
                    <div class="bill-actions">
                        <button class="btn-icon" onclick="toggleBillStatus('${id}')" title="${isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}">
                            <i data-lucide="${isPaid ? 'x' : 'check'}" style="color: ${isPaid ? '#64748b' : '#22c55e'}"></i>
                        </button>
                        <button class="btn-icon" onclick="openEditBillModal('${id}')" title="Edit Bill">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteBillItem('${id}')" title="Delete Bill">
                            <i data-lucide="trash-2" style="color: #ef4444;"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    /* ===============================
       ⚡ 5. ACTIONS: TOGGLE, EDIT, DELETE
    =============================== */
    window.toggleBillStatus = async (id) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                fetchBills();
            }
        } catch (e) {
            console.error("Toggle bill error:", e);
        }
    };

    window.deleteBillItem = async (id) => {
        if (!confirm("Are you sure you want to delete this bill?")) return;
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                fetchBills();
            }
        } catch (e) {
            console.error("Delete bill error:", e);
        }
    };

    window.openEditBillModal = (id) => {
        const bill = bills.find(b => (b._id && b._id.$oid ? b._id.$oid : b._id) === id);
        if (!bill) return;

        $("edit-bill-id").value = id;
        $("edit-bill-name").value = bill.name || "";
        $("edit-bill-amount").value = bill.amount || "";
        $("edit-bill-date").value = bill.date || "";
        $("edit-bill-category").value = bill.category || "Bills";

        const modal = $("editBillModal");
        if (modal) modal.classList.add("active");
    };

    /* ===============================
       🔘 6. FILTER EVENT LISTENERS
    =============================== */
    document.querySelectorAll(".filter-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            activeFilter = tab.getAttribute("data-filter") || "ALL";
            renderBills();
        });
    });

    $("billSearchInput")?.addEventListener("input", renderBills);
    $("billCategoryFilter")?.addEventListener("change", renderBills);
    $("billMonthFilter")?.addEventListener("change", renderBills);

    /* ===============================
       📝 7. MODALS (ADD & EDIT)
    =============================== */
    const addModal = $("addBillModal");
    const editModal = $("editBillModal");

    $("openAddBillModalBtn")?.addEventListener("click", () => {
        if (addModal) addModal.classList.add("active");
    });

    $("closeAddBillModalBtn")?.addEventListener("click", () => {
        if (addModal) addModal.classList.remove("active");
    });
    $("cancelAddBillBtn")?.addEventListener("click", () => {
        if (addModal) addModal.classList.remove("active");
    });

    $("closeEditBillModalBtn")?.addEventListener("click", () => {
        if (editModal) editModal.classList.remove("active");
    });
    $("cancelEditBillBtn")?.addEventListener("click", () => {
        if (editModal) editModal.classList.remove("active");
    });

    // Submit Add Bill
    $("modal-add-bill-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = $("modal-bill-name").value.trim();
        const amount = Number($("modal-bill-amount").value);
        const date = $("modal-bill-date").value;
        const category = $("modal-bill-category").value;

        if (!name || isNaN(amount) || amount <= 0 || !date) {
            alert("Please fill all required fields correctly.");
            return;
        }

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, amount, date, category })
            });

            if (res.ok) {
                if (addModal) addModal.classList.remove("active");
                $("modal-add-bill-form").reset();
                fetchBills();
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(errData.error || "Failed to add bill.");
            }
        } catch (err) {
            console.error("Add bill error:", err);
            alert("Network error adding bill.");
        }
    });

    // Submit Edit Bill
    $("modal-edit-bill-form")?.addEventListener("submit", async (e) => {
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

        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, amount, date, category })
            });

            if (res.ok) {
                if (editModal) editModal.classList.remove("active");
                fetchBills();
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(errData.error || "Failed to update bill.");
            }
        } catch (err) {
            console.error("Edit bill error:", err);
            alert("Network error updating bill.");
        }
    });

    // Initial load
    fetchBills();
});
