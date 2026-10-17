import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import agents from 'agents/vite'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [agents(), react(), cloudflare(), ssrPlugin()]
})
