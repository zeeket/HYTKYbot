import { startServer, TestServer } from './support/server'

const PORT = 3578

describe('HYTKYbot announcement service (e2e)', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startServer(PORT)
  })

  afterAll(async () => {
    await server?.stop()
  })

  it('sends a real announcement message to the configured announcement groups', async () => {
    const response = await fetch(`${server.baseUrl}/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[e2e test] HYTKYbot announcement e2e run at ${new Date().toISOString()}` }),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(200)
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.length).toBeGreaterThan(0)
    body.results.forEach((result: { success: boolean }) => {
      expect(result.success).toBe(true)
    })
  })

  it('rejects a request with no message', async () => {
    const response = await fetch(`${server.baseUrl}/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid or missing message')
  })

  it('rejects a request with an empty message', async () => {
    const response = await fetch(`${server.baseUrl}/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid or missing message')
  })

  it('rejects a request with a malformed user id', async () => {
    const response = await fetch(`${server.baseUrl}/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '[e2e test] should not be sent', user: 'not-a-user-id' }),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid user ID')
  })

  it('sends a real direct message to a specified Telegram user', async () => {
    if (!process.env.TEST_USER_ID) {
      throw new Error(
        'TEST_USER_ID env var is required for this test (a real Telegram user ID that has started a chat with the bot).'
      )
    }

    const response = await fetch(`${server.baseUrl}/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[e2e test] HYTKYbot direct message e2e run at ${new Date().toISOString()}`,
        user: process.env.TEST_USER_ID,
      }),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(200)
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].success).toBe(true)
  })
})
