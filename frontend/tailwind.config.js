/** @type {import('tailwindcss').Config} */
//
// Science Workbench — 轻奢高智暖色调 (warm ivory · SYSU green)
// ─────────────────────────────────────────────────────────────
// Color is authored in OKLCH. Surfaces are a deeper, green-tinted warm
// ivory (NOT flat beige): warmth lives in the accent + type + imagery,
// not a yellow body bg. Ink is a deep forest-green near-black for
// contrast ≥ 4.5:1 on body text. clay is the SYSU green brand accent.
// amber is a restrained warm-gold used ONLY for status punctuation.
//
// Material rule (ghost-card ban): a surface gets EITHER a defined shadow
// (≤6px blur) OR a solid hairline border, never both as decoration.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm ivory surfaces, green-tinted (hue ~140), low chroma.
        // 50 = main content surface; 100 = chrome/panels; 200 = recessed.
        cream: {
          50: '#F6F4EC',
          100: '#EFECE1',
          150: '#E7E3D6',
          200: '#DCD6C5',
          300: '#C9C2AD',
          400: '#A89F84',
        },
        // Forest-green near-black ink ramp. 900/800 carry body & headings;
        // 600/500 are the minimum for readable labels (no 300/400 on body).
        ink: {
          900: '#17241D',
          800: '#243529',
          700: '#36493A',
          600: '#4A5C4E',
          500: '#647467',
          400: '#859086',
          300: '#A8B0A6',
        },
        // SYSU green accent (brand). Restrained by default.
        clay: {
          50: '#E8F1EB',
          100: '#CFE3D5',
          200: '#9FC8AC',
          300: '#62A87F',
          400: '#2E8758',
          500: '#006A3A',
          600: '#00562F',
          700: '#003F22',
        },
        // Warm-gold status punctuation (sparingly — not decorative gradients).
        amber: {
          400: '#C2924A',
          500: '#A97530',
        },
        ok: '#2E8758',
        warn: '#A97530',
        err: '#9C4533',
      },
      fontFamily: {
        serif: ['Newsreader', '"Noto Serif SC"', '"Source Han Serif SC"', 'Georgia', 'serif'],
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
        // Cards cap at 12px; pills/tags keep full rounding via rounded-full.
        DEFAULT: '8px',
        lg: '12px',
      },
      boxShadow: {
        // Defined shadows only. No 0 0 0 1px hairline paired with these.
        subtle: '0 1px 2px rgba(23,36,29,0.05)',
        card: '0 2px 6px rgba(23,36,29,0.07)',
        lift: '0 10px 24px rgba(20,50,35,0.14)',
        ring: '0 0 0 1px rgba(23,36,29,0.10)',
      },
    },
  },
  plugins: [],
};
