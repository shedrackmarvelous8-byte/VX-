import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'
import fs from 'fs'
import { type DevServerState } from './types'
import { syncProjectFilesToDisk } from './fs-sync'
import { sanitizeSandboxEnv } from './security'
import { getResolvedEnvForSandbox, getProjectSecretValues } from '../env-vars/service'
import { redactSecrets } from '../env-vars/redaction'
import { recordUsageEvent } from '../usage/tracker'

interface RunningServerInstance {
  state: DevServerState
  process?: ChildProcess
  killTimer?: NodeJS.Timeout
}

// Global registry of running development servers keyed by projectId
const serverRegistry = new Map<string, RunningServerInstance>()

/**
 * Finds an open TCP port in the 3100 - 3900 range.
 */
export async function findAvailablePort(startPort = 3100, maxAttempts = 50): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const isFree = await new Promise<boolean>((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.once('close', () => resolve(true)).close()
        })
        .listen(port, '127.0.0.1')
    })

    if (isFree) {
      return port
    }
  }

  // Fallback random port in 4000-4999 range
  return 4000 + Math.floor(Math.random() * 900)
}

/**
 * Retrieves the current status and logs of a project's dev server.
 */
export function getDevServerStatus(projectId: string): DevServerState {
  const instance = serverRegistry.get(projectId)
  if (!instance) {
    return {
      projectId,
      status: 'stopped',
      logs: [],
    }
  }
  return { ...instance.state }
}

/**
 * Starts a development server for the specified project.
 */
export async function startDevServer(
  projectId: string,
  userId: string,
  envVars?: Record<string, string>
): Promise<DevServerState> {
  // If already running or starting, return current status
  const existing = serverRegistry.get(projectId)
  if (existing && (existing.state.status === 'running' || existing.state.status === 'starting')) {
    return existing.state
  }

  // Stop any lingering instance
  if (existing) {
    await stopDevServer(projectId)
  }

  const sandboxDir = await syncProjectFilesToDisk(projectId, userId)
  const port = await findAvailablePort(3100 + (Math.abs(hashCode(projectId)) % 500))

  const state: DevServerState = {
    projectId,
    status: 'starting',
    port,
    url: `/api/sandbox/preview/${projectId}`,
    logs: [`[dev-server] Initializing isolated development server on port ${port}...`],
    startedAt: new Date().toISOString(),
  }

  const instance: RunningServerInstance = { state }
  serverRegistry.set(projectId, instance)

  const projectSecrets = await getProjectSecretValues(projectId)

  const appendLog = (line: string) => {
    const cleanLine = redactSecrets(line, projectSecrets)
    state.logs.push(cleanLine)
    if (state.logs.length > 300) {
      state.logs.shift()
    }
  }

  // Check package.json scripts
  let devCommand = ''
  const pkgPath = path.join(sandboxDir, 'package.json')
  let hasDevScript = false

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg.scripts && pkg.scripts.dev) {
        hasDevScript = true
      }
    } catch {
      hasDevScript = false
    }
  }

  const projectEnv = await getResolvedEnvForSandbox(projectId, 'preview')
  const mergedEnv = { ...projectEnv, ...(envVars || {}) }
  const env = sanitizeSandboxEnv(mergedEnv, port)

  if (hasDevScript) {
    devCommand = `npm run dev -- --port ${port}`
  } else {
    // High-performance micro HTTP server serving project root files
    devCommand = `node -e "
      const http = require('http');
      const fs = require('fs');
      const path = require('path');
      const port = ${port};
      const MIME_TYPES = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.ts': 'text/typescript',
        '.tsx': 'text/typescript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };
      const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const safePath = path.normalize(reqPath).replace(/^(\\\\.\\\\.[\\\\/\\\\])+/, '');
        const filePath = path.join(process.cwd(), safePath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'text/plain';
          res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
          res.end(fs.readFileSync(filePath));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found: ' + reqPath);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        console.log('VX Sandbox Dev Server ready on http://127.0.0.1:' + port);
      });
    "`
  }

  appendLog(`[dev-server] Launching runner process...`)

  try {
    const child = spawn(devCommand, {
      shell: true,
      cwd: sandboxDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    instance.process = child
    state.pid = child.pid

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      const lines = text.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        appendLog(line)
        if (
          state.status === 'starting' &&
          (line.includes('ready') ||
            line.includes('Local:') ||
            line.includes('listening') ||
            line.includes(`:${port}`))
        ) {
          state.status = 'running'
          appendLog(`[dev-server] Verified active and listening on port ${port}`)
        }
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf8')
      const lines = text.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        appendLog(`[err] ${line}`)
      }
    })

    child.on('error', (err: Error) => {
      state.status = 'error'
      state.error = err.message
      appendLog(`[dev-server error] ${err.message}`)
    })

    child.on('exit', (code: number | null) => {
      if (state.status !== 'stopped') {
        state.status = code === 0 ? 'stopped' : 'crashed'
        state.error = code !== 0 ? `Process exited with code ${code}` : undefined
        appendLog(`[dev-server] Server stopped with exit code ${code}`)
      }
    })

    // Poll until port becomes reachable (up to 8 seconds)
    const checkPortOpen = async () => {
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 500))
        if (state.status === 'stopped' || state.status === 'crashed' || state.status === 'error') {
          break
        }
        const isOpen = await new Promise<boolean>((resolve) => {
          const socket = new net.Socket()
          socket.setTimeout(300)
          socket.once('connect', () => {
            socket.destroy()
            resolve(true)
          })
          socket.once('timeout', () => {
            socket.destroy()
            resolve(false)
          })
          socket.once('error', () => {
            socket.destroy()
            resolve(false)
          })
          socket.connect(port, '127.0.0.1')
        })

        if (isOpen) {
          state.status = 'running'
          break
        }
      }

      if (state.status === 'starting') {
        // Fall back to running if process is still alive
        if (child.pid && !child.killed) {
          state.status = 'running'
        }
      }
    }

    checkPortOpen()
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    state.status = 'error'
    state.error = errorMsg
    appendLog(`[dev-server start failed] ${errorMsg}`)
  }

  return state
}

/**
 * Stops a project's running development server.
 */
export async function stopDevServer(projectId: string): Promise<DevServerState> {
  const instance = serverRegistry.get(projectId)
  if (!instance) {
    return {
      projectId,
      status: 'stopped',
      logs: [],
    }
  }

  const { process: child, state } = instance

  if (child && !child.killed) {
    state.status = 'stopped'
    state.logs.push('[dev-server] Stopping development server...')

    try {
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        } catch {
          // Process already dead
        }
      }, 1500)
    } catch {
      // Process already killed
    }
  }

  state.status = 'stopped'
  return state
}

/**
 * Restarts a project's development server.
 */
export async function restartDevServer(
  projectId: string,
  userId: string,
  envVars?: Record<string, string>
): Promise<DevServerState> {
  await stopDevServer(projectId)
  // Brief pause for port release
  await new Promise((r) => setTimeout(r, 400))
  return startDevServer(projectId, userId, envVars)
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}
