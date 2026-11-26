import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-bg': '#F9EAD7',
        'brand-card': '#FFF7EE',
        'brand-accent': '#E10600',
        'brand-lime': '#BFE23A',
        'brand-crimson': '#E10600',
        'brand-dark': '#1C1917',
        'brand-muted': '#78716C',
        'brand-border': '#E7D5C0',
        'brand-danger': '#E10600',
        'brand-success': '#4D7C0F',
      },
    },
  },
  plugins: [],
};
export default config;
