import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'icons/*.png'],
    manifest: {
      name: "NeoX ERP - Gestion d'entreprise",
      short_name: 'NeoX',
      description: "Application de gestion d'entreprise NeoX ERP - Facturation, Stock, Ventes, Clients",
      theme_color: '#7C3AED',
      background_color: '#F8FAFC',
      display: 'standalone',
      display_override: ['window-controls-overlay', 'minimal-ui'],
      orientation: 'portrait-primary',
      lang: 'fr-FR',
      scope: '/',
      start_url: '/',
      categories: ['business', 'productivity', 'finance'],
      prefer_related_applications: false,
      icons: [
        { src: '/icons/icon-48.png', sizes: '48x48', type: 'image/png' },
        { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
        { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
        { src: '/icons/icon-120.png', sizes: '120x120', type: 'image/png' },
        { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
        { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,webmanifest}'],
      globIgnores: ['**/sw.js', '**/workbox-*.js'],
      runtimeCaching: [
        {
          urlPattern: /^https?:\/\/.*\/api\/.*/i,
          handler: 'NetworkFirst',
          options: { cacheName: 'api-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 } },
        },
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
          handler: 'CacheFirst',
          options: { cacheName: 'images-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 } },
        },
      ],
    },
    injectRegister: false,
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
