/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./login.html",
    "./signup.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0A0A0A',
        darkCard: '#111111',
        warmAmber: {
          light: '#FFE29A',
          DEFAULT: '#F5A93B',
          glow: 'rgba(245, 169, 59, 0.15)',
        }
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow': '0 0 20px rgba(245, 169, 59, 0.2)',
      }
    },
  },
  plugins: [],
}
