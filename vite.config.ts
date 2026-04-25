import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { espViteBuild } from 'vite-plugin-c'
import tailwindcss from '@tailwindcss/vite'

// Lock the browser down to same-origin only. The display ships this bundle from
// its own HTTP server and the only network targets are its own /api/* and
// /api/ws — no fonts, scripts, or images from anywhere else. Skipped in dev so
// Vite's HMR (separate WS port + inline scripts) keeps working.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
].join('; ')

function lockdownCSP(): Plugin {
  return {
    name: 'lockdown-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--csp-meta-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), espViteBuild(), lockdownCSP()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
