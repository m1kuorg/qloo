import { cloudflareTest } from '@cloudflare/vitest-plugin'
import agents from 'agents/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    agents(),
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Tests never reach the real APIs: Qloo points at a host only the fakes in test/fake.ts serve.
      miniflare: { bindings: { QLOO_BASE_URL: 'https://qloo.test', QLOO_API_KEY: 'test-qloo-key' } }
    })
  ],
  test: { setupFiles: ['./test/setup.ts'] }
})
