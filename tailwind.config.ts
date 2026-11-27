import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: '#090907',
        bronze: {
          DEFAULT: '#6C5636',
          dark: '#4D3D26',
          light: '#8E734A',
        },
        sage: {
          DEFAULT: '#899D73',
          dark: '#687B54',
          light: '#A7BC90',
        },
        parchment: '#F5F2EB',
        sand: '#D6CFC4',
        crimson: '#C23B22',
      },
    },
  },
  plugins: [],
};
export default config;
