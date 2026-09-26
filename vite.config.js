import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    // Installable web app (iOS "Add to Home Screen", Android Chrome
    // install): the manifest plus a service worker that precaches the whole
    // build, so the app opens without signal. `registerType: 'prompt'`
    // because an update must never reload mid-session on its own - the
    // app shows a "Reload" toast instead (lib/pwa/registerSW.ts), and
    // registration is skipped inside the Android app, which ships its own
    // files and has no use for a cache in front of them.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'Boulder Tracker',
        short_name: 'Boulder Tracker',
        description: 'Training planner and log for bouldering and climbing.',
        start_url: './#/home',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // html2pdf and friends are large and lazy; still precache them so
        // PDF export works offline too.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        // The public pages are real documents, not app routes.
        navigateFallbackDenylist: [/about\.html$/, /privacy\.html$/],
      },
    }),
  ],
  // Relative, so one build serves both targets: GitHub Pages hosts the app
  // under /boulder-tracker/, while the Capacitor WebView serves it from the
  // root of https://localhost. An absolute '/boulder-tracker/' base makes
  // every asset 404 inside the APK - a silent white screen.
  base: './',
  optimizeDeps: {
    include: ['html2pdf.js', 'svelte-dnd-action']
  }
})
