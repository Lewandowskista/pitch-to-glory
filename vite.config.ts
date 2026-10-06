import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['*.svg'],
      manifest: {
        name: 'Pitch to Glory',
        short_name: 'Pitch to Glory',
        description: 'A football career, made your own.',
        theme_color: '#075e45',
        background_color: '#f4f5ee',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        clientsClaim: true,
      },
    }),
  ],
  build: { target: 'es2022', manifest: true },
});
