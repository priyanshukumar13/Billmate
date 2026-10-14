// Standardized Auth & API Helper for BillMate
(function () {
  const TOKEN_KEY = "billmateToken";
  const USER_KEY = "billmateUser";
  const EMAIL_KEY = "billmateEmail";
  const AVATAR_KEY = "billmateProfilePicture";

  const CANONICAL_PROD_URL = 'https://billmate-backend.onrender.com';
  const CANONICAL_LOCAL_URL = 'http://localhost:5000';

  // Dynamic API Base URL resolver:
  // 1. Injected Vite define (__VITE_API_BASE_URL__)
  // 2. Explicit window global override (window.BILLMATE_API_BASE_URL)
  // 3. Hostname check: localhost / 127.0.0.1 -> http://localhost:5000
  // 4. Canonical production default -> https://billmate-backend.onrender.com
  window.getBillmateApiBase = function () {
    if (typeof window.__VITE_API_BASE_URL__ === 'string' && window.__VITE_API_BASE_URL__.trim() !== '') {
      return window.__VITE_API_BASE_URL__.trim().replace(/\/+$/, '');
    }
    if (typeof window.BILLMATE_API_BASE_URL === 'string' && window.BILLMATE_API_BASE_URL.trim() !== '') {
      return window.BILLMATE_API_BASE_URL.trim().replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return CANONICAL_LOCAL_URL;
      }
    }
    return CANONICAL_PROD_URL;
  };

  window.BILLMATE_API_BASE_URL = window.getBillmateApiBase();

  window.getBillmateToken = function () {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token || token === "null" || token === "undefined" || token.trim() === "") {
        return "";
      }
      return token.trim();
    } catch (_) {
      return "";
    }
  };

  window.getBillmateUser = function () {
    try {
      return localStorage.getItem(USER_KEY) || "User";
    } catch (_) {
      return "User";
    }
  };

  window.getBillmateEmail = function () {
    try {
      return localStorage.getItem(EMAIL_KEY) || "";
    } catch (_) {
      return "";
    }
  };

  window.getBillmateAvatar = function () {
    try {
      return localStorage.getItem(AVATAR_KEY) || "icons/user-avatar.png";
    } catch (_) {
      return "icons/user-avatar.png";
    }
  };

  window.getBillmateAuthHeaders = function (extraHeaders = {}) {
    const token = window.getBillmateToken();
    const headers = {
      "Content-Type": "application/json",
      ...extraHeaders
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  window.extractApiErrorMessage = function (errData, fallback = 'Operation failed. Please try again.') {
    if (!errData) return fallback;
    if (typeof errData === 'string') return errData;
    return errData.error || errData.message || errData.msg || fallback;
  };

  window.setBillmateSession = function ({ token, user }) {
    try {
      if (token && token !== "null" && token !== "undefined") {
        localStorage.setItem(TOKEN_KEY, token.trim());
      }
      if (user?.username || user?.full_name) {
        localStorage.setItem(USER_KEY, user.full_name || user.username);
      }
      if (user?.email) localStorage.setItem(EMAIL_KEY, user.email);
      if (user?.profile_picture) localStorage.setItem(AVATAR_KEY, user.profile_picture);
    } catch (_) {}
  };

  window.clearBillmateSession = function () {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(EMAIL_KEY);
      localStorage.removeItem(AVATAR_KEY);
    } catch (_) {}
  };

  window.logoutBillmate = async function (reason) {
    const token = window.getBillmateToken();
    const baseUrl = window.getBillmateApiBase();
    if (token) {
      try {
        await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (err) {
        console.warn('Server logout notice:', err.message);
      }
    }
    window.clearBillmateSession();
    try {
      sessionStorage.clear();
      if (reason) {
        sessionStorage.setItem('billmateLogoutNotice', reason);
      } else {
        sessionStorage.setItem('billmateLogoutNotice', 'You have been securely logged out.');
      }
    } catch (_) {}
    window.location.replace("login.html");
  };

  window.billmateFetch = async function (endpointOrUrl, options = {}) {
    const baseUrl = window.getBillmateApiBase();
    const url = endpointOrUrl.startsWith('http://') || endpointOrUrl.startsWith('https://')
      ? endpointOrUrl
      : `${baseUrl}${endpointOrUrl.startsWith('/') ? '' : '/'}${endpointOrUrl}`;

    const headers = {
      ...window.getBillmateAuthHeaders(),
      ...(options.headers || {})
    };

    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers
      });
    } catch (networkErr) {
      const err = new Error(`Unable to connect to the BillMate server at ${baseUrl}. Please ensure the server is running.`);
      err.isNetworkError = true;
      err.originalError = networkErr;
      throw err;
    }

    if (response.status === 401) {
      window.logoutBillmate('Your session has expired. Please log in again.');
      const err = new Error('Your session has expired or is invalid. Please log in again.');
      err.isAuthError = true;
      err.status = 401;
      throw err;
    }

    return response;
  };

  window.fetchCurrentUser = async function () {
    const token = window.getBillmateToken();
    if (!token) return null;
    try {
      const res = await fetch(`${window.getBillmateApiBase()}/api/profile`, {
        headers: window.getBillmateAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        window.setBillmateSession({ token, user: data });
        return data;
      }
      if (res.status === 401) {
        window.logoutBillmate('Your session has expired. Please log in again.');
      }
    } catch (err) {
      console.warn("Backend unavailable while fetching current user:", err.message);
    }
    return null;
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

  // Helper to get initials from user display name
  window.getBillmateInitials = function (name) {
    if (!name || typeof name !== 'string') return 'U';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Helper to format notification time
  function formatNotificationTime(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffSecs = Math.floor((now - date) / 1000);
      if (diffSecs < 60) return 'Just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch (_) {
      return '';
    }
  }

  // Global Theme Toggle Function
  window.toggleBillmateTheme = function () {
    const current = (typeof window.getBillmateTheme === 'function') 
      ? window.getBillmateTheme() 
      : (localStorage.getItem('billmateTheme') || 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    if (typeof window.setBillmateTheme === 'function') {
      window.setBillmateTheme(next, true);
    } else {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('billmateTheme', next);
    }
    // Update theme toggle icons
    updateThemeToggleIcons();
  };

  function updateThemeToggleIcons() {
    const theme = (typeof window.getBillmateTheme === 'function')
      ? window.getBillmateTheme()
      : (localStorage.getItem('billmateTheme') || 'light');
    document.querySelectorAll('.theme-toggle-btn, #themeToggleBtn').forEach(btn => {
      btn.setAttribute('title', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  // Notifications API Controller
  let notificationsListCache = [];
  let notificationsPollingInterval = null;

  window.fetchBillmateNotifications = async function () {
    const token = window.getBillmateToken();
    if (!token) return;

    try {
      const res = await window.billmateFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        const notifications = data.notifications || [];
        const unreadCount = typeof data.unreadCount === 'number' 
          ? data.unreadCount 
          : notifications.filter(n => !n.isRead).length;

        notificationsListCache = notifications;
        renderNotificationsUI(notifications, unreadCount);
      }
    } catch (err) {
      // Quietly ignore background poll errors
    }
  };

  window.refreshBillmateNotifications = function () {
    return window.fetchBillmateNotifications();
  };

  function renderNotificationsUI(notifications, unreadCount) {
    // 1. Update badges
    document.querySelectorAll('#notificationBadge, .notification-badge').forEach(badge => {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });

    document.querySelectorAll('#notificationCountPill, .notification-count-pill').forEach(pill => {
      pill.textContent = unreadCount > 0 ? `${unreadCount} new` : 'All caught up';
    });

    // 2. Render List
    const listContainer = document.getElementById('notificationList');
    if (!listContainer) return;

    if (!notifications || notifications.length === 0) {
      listContainer.innerHTML = `
        <div class="notification-empty">
          <div class="notification-empty-icon">
            <i data-lucide="bell-off"></i>
          </div>
          <h5>No notifications</h5>
          <p>You're all caught up with your bills and reminders.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listContainer.innerHTML = notifications.map(item => {
      const isUnread = !item.isRead;
      let iconName = 'bell';
      let typeClass = 'type-general';

      if (item.type === 'BILL_CREATED') {
        iconName = 'plus-circle';
        typeClass = 'type-created';
      } else if (item.type === 'BILL_PAID') {
        iconName = 'check-circle';
        typeClass = 'type-paid';
      } else if (item.type === 'REMINDER_EMAIL') {
        iconName = 'mail';
        typeClass = 'type-email';
      }

      const formattedTime = formatNotificationTime(item.createdAt);

      return `
        <div class="notification-item ${isUnread ? 'unread' : 'read'}" data-id="${item._id}" onclick="window.markBillmateNotificationRead('${item._id}')">
          <div class="notification-icon-wrap ${typeClass}">
            <i data-lucide="${iconName}" style="width:16px; height:16px;"></i>
          </div>
          <div class="notification-content">
            <div class="notification-item-title">${escapeHtml(item.title || 'Notification')}</div>
            <div class="notification-item-message">${escapeHtml(item.message || '')}</div>
            ${formattedTime ? `<div class="notification-item-time">${formattedTime}</div>` : ''}
          </div>
          ${isUnread ? `<span class="notification-unread-dot" title="Unread"></span>` : ''}
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.markBillmateNotificationRead = async function (id) {
    if (!id) return;
    try {
      const res = await window.billmateFetch(`/api/notifications/${id}/read`, {
        method: 'PUT'
      });
      if (res.ok) {
        // Optimistically update
        notificationsListCache = notificationsListCache.map(n => n._id === id ? { ...n, isRead: true } : n);
        const unreadCount = notificationsListCache.filter(n => !n.isRead).length;
        renderNotificationsUI(notificationsListCache, unreadCount);
      }
    } catch (_) {}
  };

  window.markAllBillmateNotificationsRead = async function () {
    try {
      const res = await window.billmateFetch('/api/notifications/read-all', {
        method: 'PUT'
      });
      if (res.ok) {
        notificationsListCache = notificationsListCache.map(n => ({ ...n, isRead: true }));
        renderNotificationsUI(notificationsListCache, 0);
      }
    } catch (_) {}
  };

  window.clearReadBillmateNotifications = async function () {
    try {
      const res = await window.billmateFetch('/api/notifications', {
        method: 'DELETE'
      });
      if (res.ok) {
        notificationsListCache = notificationsListCache.filter(n => !n.isRead);
        const unreadCount = notificationsListCache.length;
        renderNotificationsUI(notificationsListCache, unreadCount);
      }
    } catch (_) {}
  };

  window.initGlobalLayout = async function () {
    const token = window.getBillmateToken();
    if (!token) return;

    // 1. Initial immediate paint from localStorage
    const cachedName = window.getBillmateUser();
    const cachedAvatar = window.getBillmateAvatar();
    
    const updateDOM = (name, avatar) => {
      const greetingText = window.getTimeBasedGreeting(name);
      const initials = window.getBillmateInitials(name);

      document.querySelectorAll('#userName, #headerGreeting').forEach(el => {
        el.textContent = el.id === 'headerGreeting' ? greetingText : name;
      });
      document.querySelectorAll('#topUserName, .header-profile-name').forEach(el => {
        el.textContent = name;
      });

      // Update initials badges
      document.querySelectorAll('#headerUserInitials, .profile-avatar-initials').forEach(el => {
        el.textContent = initials;
      });

      // Update avatar images with graceful error fallback
      document.querySelectorAll('#headerUserAvatar, #topUserAvatar, .header-user-avatar, #userAvatar, .profile-avatar-img').forEach(el => {
        const initialsSibling = el.parentElement?.querySelector('#headerUserInitials, .profile-avatar-initials');
        
        // If avatar is the broken default "icons/user-avatar.png", immediately use initials
        if (!avatar || avatar === 'icons/user-avatar.png' || avatar.includes('user-avatar.png')) {
          el.style.display = 'none';
          if (initialsSibling) initialsSibling.style.display = 'flex';
          return;
        }

        el.src = avatar;
        el.style.display = 'block';
        if (initialsSibling) initialsSibling.style.display = 'none';

        el.onerror = () => {
          el.style.display = 'none';
          if (initialsSibling) initialsSibling.style.display = 'flex';
        };
      });
    };

    updateDOM(cachedName, cachedAvatar);

    // 2. Fetch fresh user data from API in background
    try {
      const user = await window.fetchCurrentUser();
      if (user) {
        const freshName = user.full_name || user.username || 'User';
        const freshAvatar = user.profile_picture || '';
        updateDOM(freshName, freshAvatar);
      }
    } catch (_) {
      // ignore
    }

    // 3. Bind Theme Toggle Buttons
    document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        window.toggleBillmateTheme();
      };
    });
    updateThemeToggleIcons();

    // 4. Bind Notification Dropdown & Bell
    const notifBtn = document.getElementById('notificationBellBtn') || document.querySelector('.notification-bell');
    const notifDropdown = document.getElementById('notificationDropdown');

    if (notifBtn && notifDropdown) {
      notifBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = notifDropdown.classList.contains('active');
        if (!isOpen) {
          notifDropdown.classList.add('active');
          notifBtn.setAttribute('aria-expanded', 'true');
          window.fetchBillmateNotifications();
        } else {
          notifDropdown.classList.remove('active');
          notifBtn.setAttribute('aria-expanded', 'false');
        }
      };

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.notification-wrapper') && !e.target.closest('.notification-bell')) {
          notifDropdown.classList.remove('active');
          notifBtn.setAttribute('aria-expanded', 'false');
        }
      });

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          notifDropdown.classList.remove('active');
          notifBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Bind mark all read button
    document.querySelectorAll('#markAllReadBtn, .btn-mark-all-read').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.markAllBillmateNotificationsRead();
      };
    });

    // Bind clear read button
    document.querySelectorAll('#clearReadNotifsBtn, .btn-clear-read').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.clearReadBillmateNotifications();
      };
    });

    // Initial fetch of notifications & setup 30s background poll
    window.fetchBillmateNotifications();
    if (!notificationsPollingInterval) {
      notificationsPollingInterval = setInterval(() => {
        window.fetchBillmateNotifications();
      }, 30000);
    }

    // 5. Bind Logout Buttons
    document.querySelectorAll('#logoutBtn, .btn-logout').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        window.logoutBillmate();
      };
    });

    // 6. Initialize Lucide icons if available
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


