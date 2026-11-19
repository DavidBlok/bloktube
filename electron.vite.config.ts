import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

const devCsp = {
  name: 'bloktube-dev-csp',
  apply: 'serve' as const,
  transformIndexHtml: (html: string) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
}

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    build: {
      rolldownOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          engine: resolve('src/preload/engine.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react(), devCsp]
  }
})
