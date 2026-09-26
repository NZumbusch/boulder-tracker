import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Relative, so one build serves both targets: GitHub Pages hosts the app
  // under /boulder-tracker/, while the Capacitor WebView serves it from the
  // root of https://localhost. An absolute '/boulder-tracker/' base makes
  // every asset 404 inside the APK - a silent white screen.
  base: './',
  optimizeDeps: {
    include: ['html2pdf.js', 'svelte-dnd-action']
  }
})
