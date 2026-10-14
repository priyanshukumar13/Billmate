import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'

const CANONICAL_PROD_URL = 'https://billmate-backend.onrender.com';
const CANONICAL_LOCAL_URL = 'http://localhost:5000';

const currentDir = import.meta.dirname || resolve('.');

const copyStaticPlugin = (resolvedApiUrl) => ({
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
      const src = resolve(currentDir, file);
      const dest = resolve(currentDir, 'dist', file);
      if (existsSync(src)) {
        try {
          if (file === 'auth.js') {
            let content = readFileSync(src, 'utf-8');
            const injectedHeader = `window.__VITE_API_BASE_URL__ = ${JSON.stringify(resolvedApiUrl)};\nwindow.BILLMATE_API_BASE_URL = ${JSON.stringify(resolvedApiUrl)};\n`;
            writeFileSync(dest, injectedHeader + content, 'utf-8');
          } else {
            copyFileSync(src, dest);
          }
        } catch (_) {}
      }
    });
  },
});

const injectApiConfigPlugin = (resolvedApiUrl) => ({
  name: 'inject-api-config',
  transformIndexHtml(html) {
    const injection = `<script>window.__VITE_API_BASE_URL__ = ${JSON.stringify(resolvedApiUrl)}; window.BILLMATE_API_BASE_URL = ${JSON.stringify(resolvedApiUrl)};</script>`;
    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>\n    ${injection}`);
    }
    return `${injection}\n${html}`;
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredUrl = (env.VITE_API_BASE_URL || env.VITE_API_URL || '').trim().replace(/\/+$/, '');

  // Canonical base URL: explicit VITE_API_BASE_URL if set, else environment-appropriate default
  const apiUrl = configuredUrl || (mode === 'development' ? CANONICAL_LOCAL_URL : CANONICAL_PROD_URL);

  return {
    plugins: [react(), injectApiConfigPlugin(apiUrl), copyStaticPlugin(apiUrl)],
    define: {
      '__VITE_API_BASE_URL__': JSON.stringify(apiUrl),
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(currentDir, 'index.html'),
          dashboard: resolve(currentDir, 'dashboard.html'),
          bills: resolve(currentDir, 'bills.html'),
          expenses: resolve(currentDir, 'expenses.html'),
          calendar: resolve(currentDir, 'calendar.html'),
          budget: resolve(currentDir, 'budget.html'),
          assistant: resolve(currentDir, 'assistant.html'),
          reports: resolve(currentDir, 'reports.html'),
          settings: resolve(currentDir, 'settings.html'),
          login: resolve(currentDir, 'login.html'),
          signup: resolve(currentDir, 'signup.html'),
          dashboard_react: resolve(currentDir, 'src/dashboard-react-main.jsx'),
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
