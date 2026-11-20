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
      // The logo and icons are drawn by brand/build.py (see BRAND.md).
      includeAssets: [
        'icon.svg',
        'favicon.svg',
        'wordmark.svg',
        'wordmark-light.svg',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Mazono',
        short_name: 'Mazono',
        description: "Harvesting olives is hard work. Managing your grove shouldn't be.",
        theme_color: '#4d5b2a',
        // The phone's start-up screen: the sky of the icon, so it flows into the app's own.
        background_color: '#2a6699',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'monochrome-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
})
