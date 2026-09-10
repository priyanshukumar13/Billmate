import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
        assetFileNames: 'assets/[name].[ext]'
      }
    },
  },
})
