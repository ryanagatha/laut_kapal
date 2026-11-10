/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2E3192',
          light: '#3D40A6',
          navy: '#002147',
        },
        accent: {
          DEFAULT: '#E9FF00',
          hover: '#F7D400',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
