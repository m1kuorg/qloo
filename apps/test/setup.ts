import { reset } from 'cloudflare:test'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { network, requests } from './fake'

beforeAll(() => {
  // A request no fake serves fails the test instead of reaching the real network.
  network.configure({ onUnhandledFrame: 'error' })
  network.enable()
})
afterEach(async () => {
  network.resetHandlers()
  requests.length = 0
  // Wipes every Durable Object's storage and memory, so the gateway's shared cache, call count,
  // and slots start fresh in each test.
  await reset()
})
afterAll(() => network.disable())
