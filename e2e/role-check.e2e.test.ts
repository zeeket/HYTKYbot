import { startServer, TestServer } from './support/server'

const PORT = 3577
const VALID_ROLES = ['admin', 'active', 'nakki']

describe('HYTKYbot role check (e2e)', () => {
  let server: TestServer

  beforeAll(async () => {
    if (!process.env.TEST_USER_ID) {
      throw new Error(
        'TEST_USER_ID env var is required for e2e tests (a real Telegram user ID to check).'
      )
    }
    server = await startServer(PORT)
  })

  afterAll(async () => {
    await server?.stop()
  })

  it('reports healthy on /health', async () => {
    const response = await fetch(`${server.baseUrl}/health`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('healthy')
  })

  it('resolves a real Telegram user id to a role via the real Telegram API', async () => {
    const response = await fetch(server.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: process.env.TEST_USER_ID }),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(200)
    expect(VALID_ROLES).toContain(body.role)
  })

  it('rejects a malformed user id', async () => {
    const response = await fetch(server.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'not-a-user-id' }),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid user ID')
  })

  it('rejects a request with no user id', async () => {
    const response = await fetch(server.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = JSON.parse(await response.text())

    expect(response.status).toBe(400)
    expect(body.error).toBe('No user ID provided')
  })
})
