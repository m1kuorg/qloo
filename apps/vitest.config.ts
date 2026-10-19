import { cloudflareTest } from '@cloudflare/vitest-plugin'
import agents from 'agents/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    agents(),
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Tests never reach the real APIs: Qloo and Anthropic point at hosts only the fakes in
      // test/fake.ts serve, and these keys override the real ones tests would load from .dev.vars.
      // Qloo retry delays are cut to milliseconds and pacing is off, so failure paths run fast. A
      // test that needs a short timeout or pacing sets it for itself. New sessions start empty
      // instead of looking up the sample network; test/sample.test.ts turns it on. Guest pitches
      // are off whatever wrangler.jsonc or .dev.vars says; a test of the flow turns them on itself.
      // The run limits are wrangler.jsonc's, whatever .dev.vars says; a test lowers them itself.
      // Accounts are on, as the product's tests need; a test of the demo without them turns them off.
      miniflare: {
        bindings: {
          QLOO_BASE_URL: 'https://qloo.test',
          QLOO_API_KEY: 'test-qloo-key',
          QLOO_TIMEOUT_MS: '1000',
          QLOO_RETRY_DELAYS_MS: '10,30',
          QLOO_MIN_INTERVAL_MS: '0',
          ANTHROPIC_BASE_URL: 'https://anthropic.test',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
          VISITOR_SALT: 'test-visitor-salt',
          RUN_VISITOR_DAILY_CAP: '10',
          RUN_DAILY_CAP: '200',
          FREE_START_DAILY_CAP: '100',
          QLOO_VISITOR_DAILY_CALL_CAP: '2000',
          SAMPLE_NETWORK: 'off',
          GUEST_PITCHES: 'off',
          ACCOUNTS: 'on'
        }
      }
    })
  ],
  // A file's first test loads the Worker and its agent cold: about 2 s locally, over 5 s on CI.
  test: { setupFiles: ['./test/setup.ts'], testTimeout: 30_000 }
})
