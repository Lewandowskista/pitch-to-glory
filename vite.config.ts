import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { siteUrl as configuredSiteUrl } from './site';

/** The public address, for share tags and the canonical link. Override with SITE_URL. */
const siteUrl = configuredSiteUrl();
/** The release version (docs/RELEASING.md), shown in Settings and the "Updated" notice. */
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

const escapeRegExp = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/**
 * Apply public/_headers (the Cloudflare Pages format) in `vite preview`, so browser tests run
 * with the production cache and security headers, including the Content Security Policy.
 */
function previewHeaders(): Plugin {
  const rules: { pattern: RegExp; headers: [string, string][] }[] = [];
  let current: (typeof rules)[number] | null = null;
  for (const line of readFileSync('public/_headers', 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const source = line.trim().split('*').map(escapeRegExp).join('.*');
      current = { pattern: new RegExp(`^${source}$`), headers: [] };
      rules.push(current);
    } else if (current) {
      const index = line.indexOf(':');
      current.headers.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
    }
  }
  return {
    name: 'preview-headers',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '/').split('?')[0]!;
        for (const rule of rules)
          if (rule.pattern.test(path))
            for (const [name, value] of rule.headers) response.setHeader(name, value);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    previewHeaders(),
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
    react(),
    tailwind(),
    VitePWA({
      registerType: 'prompt',
      // Root SVGs are precached by globPatterns (icons as manifest icons): listing them in
      // includeAssets as well precached them twice.
      manifest: {
        name: 'Pitch to Glory',
        short_name: 'Pitch to Glory',
        description: 'A football career, made your own.',
        theme_color: '#075e45',
        background_color: '#f4f5ee',
        display: 'standalone',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['games', 'sports'],
        // SVG first; PNG copies (scripts/raster.mjs) for platforms that need raster icons.
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Career hub', short_name: 'Career', url: '/career' },
          { name: 'Matchday', short_name: 'Match', url: '/match' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Pixi's environment bundles (events, accessibility, filters; the web-worker variant).
        // The pitch starts its WebGL renderer with `manageImports: false` (pitchScene.ts), so
        // they are emitted but never requested, and offline play does not need them cached.
        // The manifest's icons are precached as manifest icons already (`icon*.svg` would
        // otherwise be listed twice).
        globIgnores: ['**/browserAll-*.js', '**/webworkerAll-*.js', 'icon*.svg'],
        navigateFallback: '/index.html',
        clientsClaim: true,
        // The music loop (src/assets/audio/, about 600 KB) comes in two formats and a browser
        // plays one, so it is cached on first play rather than precached: offline play keeps
        // the music once it has been heard, and nobody downloads both formats.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/after-the-floodlights-[\w-]+\.(?:ogg|m4a)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'music',
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: 'es2022', manifest: true },
});
