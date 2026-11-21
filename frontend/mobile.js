/**
 * BillMate Mobile Integration & Navigation Controller
 * Handles Capacitor native lifecycle, back button, status bar, safe areas,
 * offline notifications, and mobile bottom navigation for Android.
 */
(function () {
  'use strict';

  // 1. Platform Detection
  function isNativeAndroid() {
    return Boolean(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.getPlatform() === 'android'
    );
  }

  function isNativePlatform() {
    return Boolean(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  }

  window.isBillmateNative = isNativePlatform;
  window.isBillmateAndroid = isNativeAndroid;

  // 2. Mobile Splash & Native App Launch Routing
  function handleNativeLaunchRouting() {
    if (!isNativePlatform()) return;

    const currentPath = window.location.pathname.toLowerCase();
    const isRootOrIndex = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/');

    if (isRootOrIndex) {
      const token = typeof window.getBillmateToken === 'function'
        ? window.getBillmateToken()
        : localStorage.getItem('billmateToken');

      if (token && token.trim() !== '') {
        window.location.replace('dashboard.html');
      } else {
        window.location.replace('login.html');
      }
    }
  }

  // 3. Status Bar & Theme Matching
  async function configureStatusBar() {
    if (!isNativePlatform() || !window.Capacitor?.Plugins?.StatusBar) return;

    try {
      const { StatusBar, Style } = window.Capacitor.Plugins;
      const theme = (typeof window.getBillmateTheme === 'function')
        ? window.getBillmateTheme()
        : (localStorage.getItem('billmateTheme') || 'light');

      await StatusBar.setOverlaysWebView({ overlay: false });

      if (theme === 'dark') {
        await StatusBar.setStyle({ style: 'DARK' });
        await StatusBar.setBackgroundColor({ color: '#090D16' });
      } else {
        await StatusBar.setStyle({ style: 'LIGHT' });
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' });
      }
    } catch (err) {
      console.warn('[Mobile] StatusBar config:', err.message);
    }
  }

  // 4. Android Hardware Back Button
  function setupAndroidBackButton() {
    if (!isNativeAndroid() || !window.Capacitor?.Plugins?.App) return;

    try {
      const { App } = window.Capacitor.Plugins;
      App.addListener('backButton', ({ canGoBack }) => {
        // If an open modal exists, close it first
        const openModal = document.querySelector('.modal.active, .modal[style*="display: block"], .modal[style*="display: flex"], #addBillModal.active, #expenseModal.active');
        if (openModal) {
          openModal.classList.remove('active');
          openModal.style.display = 'none';
          return;
        }

        const currentPath = window.location.pathname.toLowerCase();
        const isDashboard = currentPath.endsWith('dashboard.html') || currentPath.endsWith('dashboard');
        const isLogin = currentPath.endsWith('login.html');

        if (isDashboard || isLogin) {
          // Minimize / exit app on primary views
          App.minimizeApp ? App.minimizeApp() : App.exitApp();
        } else if (canGoBack && window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'dashboard.html';
        }
      });
    } catch (err) {
      console.warn('[Mobile] BackButton listener:', err.message);
    }
  }

  // 5. Keyboard Handling to Prevent Bottom Bar Squish
  function setupKeyboardHandling() {
    if (!isNativePlatform() || !window.Capacitor?.Plugins?.Keyboard) return;

    try {
      const { Keyboard } = window.Capacitor.Plugins;
      Keyboard.addListener('keyboardWillShow', () => {
        document.body.classList.add('keyboard-visible');
        const bottomNav = document.getElementById('mobileBottomNav');
        if (bottomNav) bottomNav.style.display = 'none';
      });

      Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-visible');
        const bottomNav = document.getElementById('mobileBottomNav');
        if (bottomNav) bottomNav.style.display = '';
      });
    } catch (err) {
      console.warn('[Mobile] Keyboard listener:', err.message);
    }
  }

  // 6. Network Connectivity Monitoring
  function setupNetworkMonitoring() {
    const bannerId = 'billmate-network-offline-banner';

    function showOfflineBanner() {
      let banner = document.getElementById(bannerId);
      if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:999999; background:#ef4444; color:#fff; padding:10px 16px; font-size:0.85rem; text-align:center; font-weight:600; box-shadow:0 2px 10px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center; gap:8px;';
        banner.innerHTML = '<span>📡 No Internet Connection. Some features may be unavailable.</span>';
        document.body.prepend(banner);
      }
    }

    function removeOfflineBanner() {
      const banner = document.getElementById(bannerId);
      if (banner) banner.remove();
    }

    window.addEventListener('offline', showOfflineBanner);
    window.addEventListener('online', removeOfflineBanner);

    if (!navigator.onLine) {
      showOfflineBanner();
    }
  }

  // 7. Inject Mobile Bottom Navigation Bar
  function injectBottomNavigation() {
    // Only on authenticated internal views (not index/login/signup)
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.endsWith('index.html') || currentPath.endsWith('login.html') || currentPath.endsWith('signup.html')) {
      return;
    }

    if (document.getElementById('mobileBottomNav')) return;

    const nav = document.createElement('nav');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile Navigation');

    const isCurrent = (page) => currentPath.endsWith(page);

    nav.innerHTML = `
      <a href="dashboard.html" class="nav-item ${isCurrent('dashboard.html') ? 'active' : ''}">
        <div class="nav-icon"><i data-lucide="layout-dashboard"></i></div>
        <span>Home</span>
      </a>
      <a href="bills.html" class="nav-item ${isCurrent('bills.html') ? 'active' : ''}">
        <div class="nav-icon"><i data-lucide="receipt"></i></div>
        <span>Bills</span>
      </a>
      <div class="nav-item-center">
        <button type="button" class="btn-quick-expense" id="quickAddExpenseBtn" title="Add Expense" aria-label="Add Expense">
          <i data-lucide="plus"></i>
        </button>
      </div>
      <a href="budget.html" class="nav-item ${isCurrent('budget.html') ? 'active' : ''}">
        <div class="nav-icon"><i data-lucide="target"></i></div>
        <span>Budget</span>
      </a>
      <a href="settings.html" class="nav-item ${isCurrent('settings.html') ? 'active' : ''}">
        <div class="nav-icon"><i data-lucide="settings"></i></div>
        <span>Settings</span>
      </a>
    `;

    document.body.appendChild(nav);

    // Bind center action button to open Expense Modal
    const centerBtn = document.getElementById('quickAddExpenseBtn');
    if (centerBtn) {
      centerBtn.onclick = (e) => {
        e.preventDefault();
        if (typeof window.openAddExpenseModal === 'function') {
          window.openAddExpenseModal();
        } else {
          // Fallback or trigger bill modal
          const addBillBtn = document.getElementById('openAddBillModalBtn');
          if (addBillBtn) addBillBtn.click();
        }
      };
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // 8. Init on Ready
  function initMobile() {
    handleNativeLaunchRouting();
    configureStatusBar();
    setupAndroidBackButton();
    setupKeyboardHandling();
    setupNetworkMonitoring();
    injectBottomNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobile);
  } else {
    initMobile();
  }

  // Re-run status bar if theme changes
  window.addEventListener('storage', (e) => {
    if (e.key === 'billmateTheme') {
      configureStatusBar();
    }
  });
})();
