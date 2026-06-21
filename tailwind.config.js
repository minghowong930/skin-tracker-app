/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'apple-bg': '#F5F5F7',
        'apple-card': '#FFFFFF',
        'apple-text': '#1D1D1F',
        'apple-gray': '#86868B',
        'apple-blue': '#0071E3',
        'checks-favour': '#34C759',
        'checks-against': '#FF3B30',
        'checks-neutral': '#8E8E93'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'San Francisco', 'Helvetica Neue', 'Helvetica', 'sans-serif'],
      },
      borderRadius: {
        'apple': '16px',
      },
      boxShadow: {
        'apple': '0 4px 12px rgba(0,0,0,0.05)',
      }
    },
  },
  plugins: [],
}