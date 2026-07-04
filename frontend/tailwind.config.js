/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FAF9F5',
          100: '#F5F4EE',
          200: '#EFEEE6',
          300: '#E8E6DC',
          400: '#D8D6CA',
        },
        ink: {
          900: '#1A1A1A',
          700: '#404040',
          500: '#6B6B6B',
          300: '#9A9A9A',
        },
        clay: {
          50: '#FDF4F0',
          100: '#FAE5DC',
          400: '#E89B7E',
          500: '#D97757',
          600: '#C56344',
        },
        ok: '#5B8A5A',
        warn: '#C9A227',
        err: '#B54545',
      },
      fontFamily: {
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        sans: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        lg: ['16px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['26px', '34px'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(0,0,0,0.04)',
        card: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px #E8E6DC',
      },
    },
  },
  plugins: [],
};
