/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        uno: {
          red: '#ed1c24',
          blue: '#0072bc',
          green: '#50b848',
          yellow: '#fff200',
          dark: '#1f2937',
          darker: '#111827'
        }
      }
    },
  },
  plugins: [],
}
