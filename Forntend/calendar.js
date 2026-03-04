document.addEventListener("DOMContentLoaded", async () => {
    /* ===============================
       🔐 1. SIMPLE AUTH CHECK (FLASK)
    =============================== */
    const userEmail = localStorage.getItem('billmateUser');
    if (!userEmail) {
        window.location.href = 'login.html';
        return;
    }

    const $ = id => document.getElementById(id);
    const API_URL = "http://127.0.0.1:5000/api/bills";
    
    // State
    let currentDate = new Date();
    let bills = []; 

    const getAuthHeaders = () => ({
        'Content-Type': 'application/json'
    });

    /* ===============================
       📥 2. FETCH DATA FROM API
    =============================== */
    async function fetchAndRender() {
        try {
            const response = await fetch(API_URL, { headers: getAuthHeaders() });
            if (response.ok) {
                bills = await response.json();
                renderCalendar();
            } else {
                console.error("Failed to fetch bills");
            }
        } catch (error) {
            console.error("Error connecting to API:", error);
        }
    }

    /* ===============================
       📅 3. RENDER FUNCTION
    =============================== */
    function renderCalendar() {
        const calendarGrid = $("calendarGrid");
        const monthDisplay = $("monthDisplay");
        if (!calendarGrid) return;
        
        calendarGrid.innerHTML = "";
        
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDate);
        monthDisplay.innerText = `${monthName} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Generate Empty Slots
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
                // Normalize date string (handles ISO dates or YYYY-MM-DD)
                const billDate = b.date.split('T')[0]; 
                return billDate === cellDateStr;
            });
            
            billsDue.forEach(bill => {
                const billTag = document.createElement("div");
                billTag.className = "calendar-bill-tag";
                if (bill.status === "Paid") billTag.classList.add("paid-dot");
                
                billTag.innerText = bill.name;
                dayDiv.appendChild(billTag);
            });

            // Highlight Today
            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayDiv.classList.add("today");
            }

            calendarGrid.appendChild(dayDiv);
        }
    }

    /* ===============================
       🕹️ 4. CONTROLS & LOGOUT
    =============================== */
    if ($("prevMonth")) {
        $("prevMonth").onclick = () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        };
    }

    if ($("nextMonth")) {
        $("nextMonth").onclick = () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        };
    }

    if ($("logoutBtn")) {
        $("logoutBtn").onclick = () => {
            localStorage.clear();
            window.location.href = "login.html";
        };
    }

    // Initial Load
    fetchAndRender();
});