import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        basicSsl(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['pwa-icon.svg', 'icons-192.png', 'icons-512.png'],
          manifest: {
            name: 'MRI Hologram Viewer',
            short_name: 'MRI Viewer',
            description: 'Lightweight WebXR MRI hologram viewer',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#000000',
            theme_color: '#0f172a',
            icons: [
              {
                src: '/icons-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable',
              },
              {
                src: '/icons-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
              },
            ],
          },
          workbox: {
            // Cache the app shell built by Vite
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            // Also runtime-cache CDN assets referenced from index.html importmap/tailwind
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/cdn\.tailwindcss\.com\//i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'tailwind-cdn',
                  expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
                },
              },
              {
                urlPattern: /^https:\/\/esm\.sh\//i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'esm-sh',
                  expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
                },
              },
              {
                urlPattern: /^https:\/\/media\.githubusercontent\.com\//i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'mri-data',
                  expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
                },
              },
            ],
          },
          devOptions: {
            enabled: true,
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
