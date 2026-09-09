import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === '1' ? '/dotori-alkkagi/' : '/',
  publicDir: 'public',
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
  },
});
