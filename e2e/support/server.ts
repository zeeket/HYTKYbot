import { ChildProcess, spawn } from 'child_process'
import path from 'path'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const HEALTH_POLL_INTERVAL_MS = 500
const HEALTH_POLL_TIMEOUT_MS = 20000

export interface TestServer {
  baseUrl: string
  stop: () => Promise<void>
}

const waitForHealth = async (baseUrl: string): Promise<void> => {
  const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
  }

  throw new Error(
    `Server did not become healthy within ${HEALTH_POLL_TIMEOUT_MS}ms: ${String(lastError)}`
  )
}

export const startServer = async (port: number): Promise<TestServer> => {
  const requiredEnvVars = ['TG_BOT_TOKEN', 'TG_ADMIN_GROUP_IDS', 'TG_ACTIVE_GROUP_IDS', 'TG_ANNOUNCEMENT_GROUP_IDS']
  const missing = requiredEnvVars.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars for e2e tests: ${missing.join(', ')}. ` +
        'Set them locally (e.g. in .env) or as GitHub Actions secrets in CI.'
    )
  }

  const child: ChildProcess = spawn('pnpm', ['exec', 'ts-node', 'src/app.ts'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe',
  })

  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString()
  })

  const exitedEarly = new Promise<never>((_, reject) => {
    child.once('exit', (code) => {
      reject(new Error(`Server process exited early with code ${code}. Output:\n${output}`))
    })
  })

  const baseUrl = `http://localhost:${port}`

  await Promise.race([waitForHealth(baseUrl), exitedEarly]).catch((error) => {
    child.kill('SIGTERM')
    throw error
  })

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.killed) {
      return
    }
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
      child.kill('SIGTERM')
    })
  }

  return { baseUrl, stop }
}
