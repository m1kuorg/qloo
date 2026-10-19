import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import agents from 'agents/vite'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [agents(), react(), cloudflare(), ssrPlugin()],
  // The developer docs import the Claude Code plugin's files, in the repo's plugins/, as text.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../plugins'] } }
})
