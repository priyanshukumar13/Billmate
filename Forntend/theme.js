// Global theme manager for BillMate app pages
(function () {
  const SETTINGS_KEY = 'userSettings';
  const THEME_KEY = 'billmateTheme';

  function readSettingsTheme() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed.darkMode === 'boolean') {
        return parsed.darkMode ? 'dark' : 'light';
      }
      return null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('theme-dark', t === 'dark');
    document.body.classList.toggle('theme-light', t === 'light');
  }

  const storedSettingsTheme = readSettingsTheme();
  const storedTheme = localStorage.getItem(THEME_KEY);
  const initialTheme =
    storedSettingsTheme ||
    (storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyTheme(initialTheme));
  } else {
    applyTheme(initialTheme);
  }

  // Expose a helper to update theme from settings page
  window.setBillmateTheme = function (theme, persistSettings) {
    const t = theme === 'light' ? 'light' : 'dark';
    applyTheme(t);
    localStorage.setItem(THEME_KEY, t);

    if (persistSettings) {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.darkMode = t === 'dark';
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
      } catch {
        // ignore
      }
    }
  };
})();

