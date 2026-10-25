/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fbf7ee',
          100: '#f5edd6',
          200: '#ebd9aa',
          300: '#dec077',
          400: '#d1a54c',
          500: '#c58e33',
          600: '#a97127',
          700: '#875322',
          800: '#6f4321',
          900: '#5c381f',
        },
        dark: {
          900: '#121214',
          800: '#1a1a1e',
          700: '#26262b',
          600: '#323239',
        }
      },
    },
  },
  plugins: [],
};
