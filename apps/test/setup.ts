import { afterAll, afterEach, beforeAll } from 'vitest'
import { fakeTopic, network, requests } from './fake'

beforeAll(() => {
  // A request no fake serves fails the test instead of reaching the real network.
  network.configure({ onUnhandledFrame: 'error' })
  network.enable()
})
afterEach(() => {
  network.resetHandlers()
  requests.length = 0
  fakeTopic()
})
afterAll(() => network.disable())
