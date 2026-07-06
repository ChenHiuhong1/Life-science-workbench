/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FAF8F1',
          100: '#F3EEE2',
          200: '#E8DDC8',
          300: '#D8C6A6',
          400: '#BFA77D',
        },
        ink: {
          900: '#14241C',
          800: '#20362A',
          700: '#365344',
          500: '#607468',
          400: '#839487',
          300: '#AAB7AE',
        },
        clay: {
          50: '#EAF4EE',
          100: '#D4E8DC',
          200: '#A9D1B8',
          300: '#73B08D',
          400: '#2E8556',
          500: '#006A3A',
          600: '#004F2D',
        },
        ok: '#2E8556',
        warn: '#A98542',
        err: '#A14A3A',
      },
      fontFamily: {
        serif: ['"IBM Plex Sans"', '"Noto Sans SC"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', '"Noto Sans SC"', '"Segoe UI"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Cascadia Mono"', 'Menlo', 'Consolas', 'monospace'],
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
        subtle: '0 1px 2px rgba(20,36,28,0.06)',
        card: '0 4px 8px rgba(20,36,28,0.08), 0 0 0 1px #D8C6A6',
        lift: '0 8px 14px rgba(20,50,35,0.13)',
      },
    },
  },
  plugins: [],
};
