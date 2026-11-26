import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-bg': '#020617',
        'brand-card': '#18181b',
        'brand-accent': '#6366f1',
        'brand-danger': '#ef4444',
        'brand-success': '#22c55e',
      },
    },
  },
  plugins: [],
};
export default config;
