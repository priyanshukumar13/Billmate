document.addEventListener("DOMContentLoaded", async () => { // Added async here

    /* ===============================
       🔐 1. AUTH CHECK
    =============================== */
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    const $ = id => document.getElementById(id);
    const API_URL = "https://billmate-backend.onrender.com/api/bills";

    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    });

    /* ===============================
       📥 2. FETCH DATA FROM API (Instead of localStorage)
    =============================== */
    let bills = [];
    try {
        const response = await fetch(API_URL, { headers: getAuthHeaders() });
        if (response.ok) {
            bills = await response.json();
            renderAnalytics(bills); // Call the function to build the page
        } else {
            console.error("Failed to fetch bills from server");
        }
    } catch (error) {
        console.error("Error connecting to API:", error);
    }

    function renderAnalytics(allBills) {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        /* ===============================
           📅 FILTER MONTHLY BILLS
        =============================== */
        const monthlyBills = allBills.filter(bill => {
            if (!bill.date) return false;
            const d = new Date(bill.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        /* ===============================
           📊 CALCULATIONS
        =============================== */
        let totalPaid = 0;
        let highest = { amount: 0, name: "None" };
        let categoryTotals = { Rent: 0, Food: 0, Bills: 0, Other: 0 };

        monthlyBills.forEach(bill => {
            const amt = Number(bill.amount) || 0;

            // Normalize category naming to match Dashboard
            categoryTotals[bill.category] = (categoryTotals[bill.category] || 0) + amt;

            if (amt > highest.amount) {
                highest = { amount: amt, name: bill.name };
            }

            if (bill.status === "Paid") totalPaid += amt;
        });

        /* ===============================
           🧾 UPDATE STATS
        =============================== */
        if ($("total-paid-amt")) $("total-paid-amt").innerText = `₹${totalPaid}`;
        if ($("highest-bill-amt")) $("highest-bill-amt").innerText = `₹${highest.amount}`;
        if ($("highest-bill-name")) $("highest-bill-name").innerText = highest.name;
        if ($("total-bills-count")) $("total-bills-count").innerText = monthlyBills.length;

        const avg = monthlyBills.length ? Math.round(totalPaid / monthlyBills.length) : 0;
        if ($("avg-bill-amt")) $("avg-bill-amt").innerText = `₹${avg}`;

        /* ===============================
           📉 CHARTS
        =============================== */
        if (window.Chart && $("categoryChart")) {
            new Chart($("categoryChart").getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: Object.keys(categoryTotals),
                    datasets: [{
                        data: Object.values(categoryTotals),
                        backgroundColor: ["#3b82f6", "#ef4444", "#f59e0b", "#10b981"],
                        borderWidth: 2,
                        borderColor: "#fff"
                    }]
                },
                options: { cutout: "70%", maintainAspectRatio: false }
            });
        }

        if (window.Chart && $("billBarChart")) {
            new Chart($("billBarChart").getContext("2d"), {
                type: "bar",
                data: {
                    labels: monthlyBills.map(b => b.name),
                    datasets: [{
                        label: 'Bill Amount',
                        data: monthlyBills.map(b => b.amount),
                        backgroundColor: monthlyBills.map(b =>
                            b.status === "Paid" ? "#2563eb" : "#cbd5e1"
                        ),
                        borderRadius: 6
                    }]
                },
                options: { maintainAspectRatio: false }
            });
        }
    }

    /* ===============================
       🚪 LOGOUT
    =============================== */
    if ($("logoutBtn")) {
        $("logoutBtn").onclick = () => {
            localStorage.clear();
            window.location.href = "login.html";
        };
    }
});