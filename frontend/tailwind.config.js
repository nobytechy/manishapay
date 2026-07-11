/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0b1220',
        },
        // Brand palette — matches the ManishaPay logo (blue → green,
        // "gateway agnostic"). Green is the primary action colour ("Pay");
        // the logo blue lives in `brandblue` + the hero gradients.
        brand: {
          50:  '#edf8f1',
          100: '#d3efdd',
          200: '#a8e0bd',
          300: '#74cd97',
          400: '#43b66e',
          500: '#22a65a',
          DEFAULT: '#22a65a',
          600: '#1b8c4b',
          700: '#176f3d',
          dark: '#176f3d',
          800: '#155a33',
          900: '#114629',
          950: '#0c3018',
          light: '#74cd97',
        },
        // Logo blue — trust accent (admin, secondary highlights, gradient start).
        brandblue: {
          300: '#7cb0ee',
          400: '#4a8ce0',
          500: '#2166c4',
          DEFAULT: '#2166c4',
          600: '#1a4f9c',
          700: '#163f7c',
        },
        warn: '#f59e0b',
        danger: '#e43d5e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient':       'linear-gradient(135deg, #2166c4 0%, #22a65a 100%)',
        'brand-gradient-deep':  'linear-gradient(135deg, #1a4f9c 0%, #14472a 100%)',
        'brand-gradient-soft':  'linear-gradient(135deg, #d9e8fb 0%, #d3efdd 100%)',
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.08)',
        glow:  '0 8px 24px -8px rgb(34 166 90 / 0.55)',
      },
      animation: {
        shimmer: 'shimmer 1.5s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
