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
        // Emerald-fintech palette — matches gradient
        // linear-gradient(135deg, #10b981 0%, #047857 100%)
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          DEFAULT: '#10b981',
          600: '#059669',
          700: '#047857',
          dark: '#047857',
          800: '#065f46',
          900: '#064e3b',
          light: '#6ee7b7',
        },
        warn: '#f59e0b',
        danger: '#e43d5e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient':       'linear-gradient(135deg, #10b981 0%, #047857 100%)',
        'brand-gradient-deep':  'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
        'brand-gradient-soft':  'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.08)',
        glow:  '0 8px 24px -8px rgb(16 185 129 / 0.55)',
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
