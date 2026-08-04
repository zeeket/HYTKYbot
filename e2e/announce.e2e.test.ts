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
})
