document.addEventListener("DOMContentLoaded", () => {

    /* ===============================
       🔐 AUTH CHECK
    =============================== */
    const userEmail = localStorage.getItem("billmateUser");
    if (!userEmail || userEmail.trim() === "") {
        window.location.href = "login.html";
        return;
    }

    /* ===============================
       ⚙️ LOAD SETTINGS
    =============================== */
    const defaultSettings = {
        name: userEmail.split("@")[0],
        currency: "₹",
        budget: 50000,
        darkMode: false
    };

    const settings = JSON.parse(localStorage.getItem("userSettings")) || defaultSettings;

    /* ===============================
       🧩 SAFE DOM HELPERS
    =============================== */
    const $ = id => document.getElementById(id);

    // Required elements check (prevents silent crash)
    const requiredIds = [
        "userName",
        "displayName",
        "displayEmail",
        "currencyPref",
        "budgetLimit",
        "darkModeToggle",
        "saveSettingsBtn",
        "resetDataBtn",
        "logoutBtn"
    ];

    for (const id of requiredIds) {
        if (!$(id)) {
            console.error(`❌ Missing element with id="${id}" in settings.html`);
            return;
        }
    }

    /* ===============================
       📝 FILL UI
    =============================== */
    $("userName").textContent = settings.name;
    $("displayName").value = settings.name;
    $("displayEmail").value = userEmail;
    $("currencyPref").value = settings.currency;
    $("budgetLimit").value = settings.budget;
    $("darkModeToggle").checked = settings.darkMode;

    /* ===============================
       💾 SAVE SETTINGS
    =============================== */
    $("saveSettingsBtn").onclick = () => {
        const newSettings = {
            name: $("displayName").value.trim() || defaultSettings.name,
            currency: $("currencyPref").value,
            budget: Number($("budgetLimit").value) || defaultSettings.budget,
            darkMode: $("darkModeToggle").checked
        };

        localStorage.setItem("userSettings", JSON.stringify(newSettings));
        alert("Settings saved successfully! ✓");
        window.location.reload();
    };

    /* ===============================
       ♻️ RESET DATA
    =============================== */
    $("resetDataBtn").onclick = () => {
        if (confirm("Are you sure? This will delete all your bills forever!")) {
            localStorage.removeItem("myBills");
            alert("App data reset.");
            window.location.href = "dashboard.html";
        }
    };

    /* ===============================
       🚪 LOGOUT
    =============================== */
    $("logoutBtn").onclick = () => {
        localStorage.removeItem("billmateUser");
        window.location.href = "login.html";
    };
});
