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
          // Hairline between rows — separation, not a control boundary.
          DEFAULT: '#DAD1BE',
          // Draws input and button edges, so it owes 3:1 as a UI boundary.
          strong: '#948868', // 3.14:1 on paper
        },
        /*
          The ink ramp is spaced by contrast, not by eye. Every step is legible
          body text on paper: a pay register read under office light has no
          decorative type in it, and the faintest step still carries the daily
          attendance mark. Recession is bought with size and weight instead.

          Ratios are quoted against paper-sunk (#EDE7D9), the darkest surface
          any of these sit on — clearing 4.5:1 there clears it everywhere.
        */
        ink: {
          DEFAULT: '#14120E', // 15.17:1
          2: '#4A443A', //  7.82:1
          3: '#625A4B', //  5.52:1
          4: '#6E6554', //  4.66:1
        },
        // Reserved: totals, stamps, absences. Never decorative.
        vermillion: {
          DEFAULT: '#B23A25', // 5.33:1
          deep: '#8C2C1B',
          wash: '#F3E2DC',
        },
        verdigris: { DEFAULT: '#3A6B52', wash: '#E2EDE5' }, // 5.52:1
        ochre: { DEFAULT: '#8A5F0E', wash: '#F5EAD4' }, // 5.05:1
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
