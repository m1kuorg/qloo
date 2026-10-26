import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import agents from 'agents/vite'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [agents(), react(), tailwindcss(), cloudflare(), ssrPlugin()],
  // `@/` is apps/src, as shadcn's components import it (components.json).
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
  // The developer docs import the Claude Code plugin's files, in the repo's plugins/, as text.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../plugins'] } }
})
