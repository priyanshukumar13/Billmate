import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, existsSync } from 'fs'

const copyStaticPlugin = () => ({
  name: 'copy-static-assets',
  closeBundle() {
    const staticFiles = [
      'auth.js',
      'dashboard.js',
      'bills.js',
      'expenses.js',
      'calendar.js',
      'budget.js',
      'settings.js',
      'assistant.js',
      'assistant-page.js',
      'contact.js',
      'theme.js',
      'script.js',
      'dashboard-style.css',
      'style.css',
    ];
    staticFiles.forEach((file) => {
      const src = resolve(__dirname, file);
      const dest = resolve(__dirname, 'dist', file);
      if (existsSync(src)) {
        try {
          copyFileSync(src, dest);
        } catch (_) {}
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_BASE_URL || env.VITE_API_URL || '';

  return {
    plugins: [react(), copyStaticPlugin()],
    define: {
      '__VITE_API_BASE_URL__': JSON.stringify(apiUrl),
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          dashboard: resolve(__dirname, 'dashboard.html'),
          bills: resolve(__dirname, 'bills.html'),
          expenses: resolve(__dirname, 'expenses.html'),
          calendar: resolve(__dirname, 'calendar.html'),
          budget: resolve(__dirname, 'budget.html'),
          assistant: resolve(__dirname, 'assistant.html'),
          reports: resolve(__dirname, 'reports.html'),
          settings: resolve(__dirname, 'settings.html'),
          login: resolve(__dirname, 'login.html'),
          signup: resolve(__dirname, 'signup.html'),
          dashboard_react: resolve(__dirname, 'src/dashboard-react-main.jsx'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
