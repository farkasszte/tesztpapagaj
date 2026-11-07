import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { extractPage } from './extract-page'
import { serviceWorker } from './service-worker'

/**
 * Injects the Cloudflare Web Analytics beacon into the built index.html.
 *
 * The token is public (it ships to the browser), but the tag is only emitted
 * when VITE_CF_BEACON_TOKEN is set, so dev servers, e2e runs, and preview
 * deploys stay out of the production dataset.
 */
function cloudflareAnalytics(token: string | undefined): Plugin {
  return {
    name: 'cloudflare-analytics',
    apply: 'build',
    transformIndexHtml() {
      if (!token) return []
      return [
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': JSON.stringify({ token }),
          },
          injectTo: 'body',
        },
      ]
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), extractPage(), serviceWorker(), cloudflareAnalytics(env.VITE_CF_BEACON_TOKEN)],
    build: {
      // A service worker ebből tudja, mit kell előre cache-elni (A2): a
      // lustán töltött készlet is a héj része, különben offline nem nyílik meg.
      manifest: 'assets-manifest.json',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('scheduler')) {
                return 'vendor-react'
              }
              if (id.includes('@milkdown') || id.includes('prosemirror')) {
                return 'vendor-editor'
              }
              if (id.includes('katex')) {
                return 'vendor-katex'
              }
              if (id.includes('mathjax')) {
                return 'vendor-mathjax'
              }
              if (id.includes('ajv')) {
                return 'vendor-ajv'
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons'
              }
              if (id.includes('jszip')) {
                return 'vendor-zip'
              }
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 8000,
      allowedHosts: ['.exe.xyz', '.edtechathon.com'],
    },
  }
})
