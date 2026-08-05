import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{js,ts,jsx,tsx}'], theme: { extend: { colors: { cream: '#FAF7F2', ink: '#292536', plum: '#6846B5', lavender: '#EEE9FB', sage: '#E6F1E7' } } }, plugins: [] };
export default config;
