import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Für GitHub Pages wird BASE_PATH=/<repo-name>/ gesetzt, lokal ist es "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Die großen OCR-Dateien werden per Laufzeit-Cache gespeichert (siehe sw.ts).
        globIgnores: ['tesseract/**'],
      },
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Kochbuch',
        short_name: 'Kochbuch',
        description: 'Dein persönliches Kochbuch – Rezepte aus Screenshots, offline auf dem Handy.',
        lang: 'de',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fffcf8',
        theme_color: '#fffcf8',
        categories: ['food', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            files: [{ name: 'images', accept: ['image/*'] }],
          },
        },
      },
      devOptions: { enabled: false },
    }),
  ],
});
