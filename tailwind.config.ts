import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F4EF',
        ink: '#282432',
        plum: '#6946B6',
        lavender: '#EEE8FB',
        sage: '#E5F1E8',
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: { card: '0 1px 2px rgba(40,36,50,.04), 0 8px 24px rgba(40,36,50,.055)' },
    },
  },
  plugins: [],
};
export default config;
