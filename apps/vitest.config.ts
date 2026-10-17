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
  // A file's first test loads the Worker and its agent cold: about 2 s locally, over 5 s on CI.
  test: { setupFiles: ['./test/setup.ts'], testTimeout: 30_000 }
})
