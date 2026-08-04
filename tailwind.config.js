/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Newsreader carries the mastheads; Plex Sans runs the interface;
        // every numeral is Plex Mono so money reads as money.
        display: ['Newsreader', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Paper stock, warm rather than white.
        paper: {
          DEFAULT: '#F6F2E9',
          raised: '#FDFBF6',
          sunk: '#EDE7D9',
          edge: '#E4DCCB',
        },
        rule: {
          DEFAULT: '#DAD1BE',
          strong: '#B7AB92',
        },
        ink: {
          DEFAULT: '#14120E',
          2: '#4A443A',
          3: '#807765',
          4: '#A79D89',
        },
        // Reserved: totals, stamps, absences. Never decorative.
        vermillion: {
          DEFAULT: '#B23A25',
          deep: '#8C2C1B',
          wash: '#F3E2DC',
        },
        verdigris: { DEFAULT: '#3A6B52', wash: '#E2EDE5' },
        ochre: { DEFAULT: '#9A6B12', wash: '#F5EAD4' },
      },
      boxShadow: {
        leaf: '0 1px 0 0 #E4DCCB, 0 2px 10px -6px rgba(20,18,14,.18)',
        lift: '0 2px 0 0 #E4DCCB, 0 12px 28px -18px rgba(20,18,14,.4)',
      },
      letterSpacing: {
        stamp: '.2em',
      },
    },
  },
  plugins: [],
}
