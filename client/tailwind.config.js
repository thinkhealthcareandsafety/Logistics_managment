/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Inter for everything you read; Inter Tight for display sizes, where the
        // default spacing looks loose at 60px+; JetBrains Mono for AWBs and code.
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef7f8',
          100: '#d3ebee',
          200: '#a7d7dd',
          300: '#74bdc6',
          400: '#4aa0ac',
          500: '#2c8290',
          600: '#1f6773',
          700: '#1a525d',
          800: '#173f47',
          900: '#0f4c5c',
          950: '#0a2e37',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 76, 92, 0.06), 0 1px 3px 0 rgba(15, 76, 92, 0.08)',
        // Public surface: a deeper, teal-tinted lift for cards that need to float.
        lift: '0 1px 2px rgba(15, 76, 92, 0.04), 0 12px 32px -12px rgba(15, 76, 92, 0.18)',
      },
    },
  },
  plugins: [],
};
