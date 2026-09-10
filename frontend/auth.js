// Standardized Auth & API Helper for BillMate
(function () {
  const TOKEN_KEY = "billmateToken";
  const USER_KEY = "billmateUser";
  const EMAIL_KEY = "billmateEmail";
  const AVATAR_KEY = "billmateProfilePicture";

  // Dynamic API Base URL resolver
  window.getBillmateApiBase = function () {
    if (window.BILLMATE_API_BASE_URL) return window.BILLMATE_API_BASE_URL;
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:5000";
    }
    return "https://billmate-backend.onrender.com";
  };

  window.BILLMATE_API_BASE_URL = window.getBillmateApiBase();

  window.getBillmateToken = function () {
    return localStorage.getItem(TOKEN_KEY) || "";
  };

  window.getBillmateUser = function () {
    return localStorage.getItem(USER_KEY) || "User";
  };

  window.getBillmateEmail = function () {
    return localStorage.getItem(EMAIL_KEY) || "";
  };

  window.getBillmateAvatar = function () {
    return localStorage.getItem(AVATAR_KEY) || "icons/user-avatar.png";
  };

  window.getBillmateAuthHeaders = function () {
    const token = window.getBillmateToken();
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  window.setBillmateSession = function ({ token, user }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user?.username || user?.full_name) {
      localStorage.setItem(USER_KEY, user.full_name || user.username);
    }
    if (user?.email) localStorage.setItem(EMAIL_KEY, user.email);
    if (user?.profile_picture) localStorage.setItem(AVATAR_KEY, user.profile_picture);
  };

  window.clearBillmateSession = function () {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(AVATAR_KEY);
  };

  window.fetchCurrentUser = async function () {
    const token = window.getBillmateToken();
    if (!token) return null;
    try {
      const res = await fetch(`${window.BILLMATE_API_BASE_URL}/api/profile`, {
        headers: window.getBillmateAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        window.setBillmateSession({ token, user: data });
        return data;
      }
      if (res.status === 401) {
        window.logoutBillmate();
      }
    } catch (err) {
      console.error("Error fetching current user:", err);
    }
    return null;
  };

  window.logoutBillmate = function () {
    window.clearBillmateSession();
    window.location.href = "login.html";
  };

  window.getTimeBasedGreeting = function (name) {
    const userName = name || window.getBillmateUser() || "User";
    const hour = new Date().getHours();
    let timeGreeting = "Good Morning";
    if (hour >= 12 && hour < 17) {
      timeGreeting = "Good Afternoon";
    } else if (hour >= 17 || hour < 4) {
      timeGreeting = "Good Evening";
    }
    return `${timeGreeting}, ${userName} 👋`;
  };

  window.initGlobalLayout = async function () {
    const token = window.getBillmateToken();
    if (!token) return;

    // 1. Initial immediate paint from localStorage
    const cachedName = window.getBillmateUser();
    const cachedAvatar = window.getBillmateAvatar();
    
    const updateDOM = (name, avatar) => {
      const greetingText = window.getTimeBasedGreeting(name);
      document.querySelectorAll('#userName, #headerGreeting').forEach(el => {
        el.textContent = el.id === 'headerGreeting' ? greetingText : name;
      });
      document.querySelectorAll('#topUserName, .header-profile-name').forEach(el => {
        el.textContent = name;
      });
      document.querySelectorAll('#headerUserAvatar, #topUserAvatar, .header-user-avatar, #userAvatar').forEach(el => {
        el.src = avatar || 'icons/user-avatar.png';
      });
    };

    updateDOM(cachedName, cachedAvatar);

    // 2. Fetch fresh user data from API in background
    try {
      const user = await window.fetchCurrentUser();
      if (user) {
        const freshName = user.full_name || user.username || 'User';
        const freshAvatar = user.profile_picture || 'icons/user-avatar.png';
        updateDOM(freshName, freshAvatar);
      }
    } catch (e) {
      // ignore
    }

    // 3. Bind Logout Buttons
    document.querySelectorAll('#logoutBtn, .btn-logout').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        window.logoutBillmate();
      };
    });

    // 4. Initialize Lucide icons if available
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.initGlobalLayout();
    });
  } else {
    window.initGlobalLayout();
  }
})();

