import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211d',
        linen: '#f4f1ea',
        brass: '#9a7848',
      },
    },
  },
  plugins: [],
} satisfies Config;
