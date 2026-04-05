import '@testing-library/jest-dom'
import { server } from './mocks/server'

// jsdom does not implement HTMLElement.scrollTo — mock it globally for all suites
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  writable: true,
  value: () => {},
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
