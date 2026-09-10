// Global theme manager for BillMate app pages
(function () {
  const THEME_KEY = 'billmateTheme';
  const SETTINGS_KEY = 'userSettings';

  function getSavedTheme() {
    // 1. Direct explicit theme key
    const directTheme = localStorage.getItem(THEME_KEY);
    if (directTheme === 'light' || directTheme === 'dark') {
      return directTheme;
    }

    // 2. Backward compatibility with userSettings.darkMode
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.darkMode === 'boolean') {
          const t = parsed.darkMode ? 'dark' : 'light';
          localStorage.setItem(THEME_KEY, t);
          return t;
        }
      }
    } catch (e) {
      // ignore
    }

    // 3. Default theme is light (matching modern BillMate design system)
    return 'light';
  }

  function applyTheme(theme) {
    const t = (theme === 'light') ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('light', t === 'light');

    if (document.body) {
      document.body.setAttribute('data-theme', t);
      document.body.classList.toggle('theme-dark', t === 'dark');
      document.body.classList.toggle('theme-light', t === 'light');
    }
  }

  // Apply immediately upon execution
  const currentTheme = getSavedTheme();
  applyTheme(currentTheme);

  // Apply on DOMContentLoaded to guarantee body attributes are set
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(getSavedTheme());
    });
  }

  // Expose getters and setters
  window.getBillmateTheme = function () {
    return getSavedTheme();
  };

  // Expose helper to change theme ONLY upon explicit user interaction
  window.setBillmateTheme = function (theme, persistSettings = true) {
    const t = (theme === 'light') ? 'light' : 'dark';
    applyTheme(t);
    localStorage.setItem(THEME_KEY, t);

    if (persistSettings) {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.darkMode = (t === 'dark');
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
      } catch (e) {
        // ignore
      }
    }
  };
})();
