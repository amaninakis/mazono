import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: { APP_VERSION: JSON.stringify(pkg.version) },
  // `npm run dev` talks to a server started with `npm run server` (port 8787).
  server: { proxy: { '/api': 'http://localhost:8787' } },
  // `npm run preview` runs the app on its own, without a server.
  preview: { proxy: {} },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // Server calls must always reach the server, never the offline copy of the app.
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'HarvestLog',
        short_name: 'HarvestLog',
        description: "Harvesting olives is hard work. Keeping track of it shouldn't be.",
        theme_color: '#4d5b2a',
        background_color: '#f7f5ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
})
