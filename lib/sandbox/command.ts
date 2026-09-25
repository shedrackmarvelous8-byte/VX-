import { spawn } from 'child_process'
import {
  type SandboxCommandRequest,
  type SandboxCommandResult,
} from './types'
import {
  validateSandboxCommand,
  sanitizeSandboxEnv,
} from './security'
import {
  syncProjectFilesToDisk,
  syncDiskFilesToDatabase,
} from './fs-sync'
import { getResolvedEnvForSandbox, getProjectSecretValues } from '../env-vars/service'
import { redactSecrets } from '../env-vars/redaction'
import { recordUsageEvent } from '../usage/tracker'

const MAX_BUFFER_SIZE = 512 * 1024 // 512KB cap for stdout/stderr
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000

export async function executeSandboxCommand(
  req: SandboxCommandRequest
): Promise<SandboxCommandResult> {
  const startTime = Date.now()

  // 1. Validate command security policy
  const validation = validateSandboxCommand(req.command)
  if (!validation.allowed) {
    return {
      command: req.command,
      exitCode: 1,
      stdout: '',
      stderr: `Security policy rejection: ${validation.reason || 'Command not permitted'}`,
      duration: Date.now() - startTime,
      status: 'rejected',
      error: validation.reason,
    }
  }

  // 2. Ensure project files are synced to disk sandbox
  let sandboxDir: string
  try {
    sandboxDir = await syncProjectFilesToDisk(req.projectId, req.userId)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      command: req.command,
      exitCode: 1,
      stdout: '',
      stderr: `Failed to initialize sandbox workspace: ${errorMsg}`,
      duration: Date.now() - startTime,
      status: 'failed',
      error: errorMsg,
    }
  }

  // 3. Prepare timeout & environment
  const timeoutMs = Math.min(
    Math.max(req.timeoutMs || DEFAULT_TIMEOUT_MS, 1_000),
    MAX_TIMEOUT_MS
  )
  const projectEnv = await getResolvedEnvForSandbox(req.projectId, 'development')
  const projectSecrets = await getProjectSecretValues(req.projectId)
  const env = sanitizeSandboxEnv({ ...projectEnv, ...(req.env || {}) })

  return new Promise<SandboxCommandResult>((resolve) => {
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let truncated = false
    let isSettled = false
    let timer: NodeJS.Timeout | null = null

    // Spawn command via shell inside sandbox cwd
    const child = spawn(req.command, {
      shell: true,
      cwd: sandboxDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      isSettled = true
    }

    timer = setTimeout(() => {
      if (isSettled) return
      cleanup()
      try {
        child.kill('SIGTERM')
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            // Process might already be dead
          }
        }, 1500)
      } catch {
        // Ignore kill errors
      }

      const duration = Date.now() - startTime
      resolve({
        command: req.command,
        exitCode: null,
        stdout: stdoutBuffer,
        stderr: stderrBuffer + `\nCommand timed out after ${timeoutMs}ms. Process terminated.`,
        duration,
        status: 'timeout',
        truncated,
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutBuffer.length < MAX_BUFFER_SIZE) {
        stdoutBuffer += chunk.toString('utf8')
        if (stdoutBuffer.length >= MAX_BUFFER_SIZE) {
          stdoutBuffer = stdoutBuffer.slice(0, MAX_BUFFER_SIZE) + '\n[Output truncated: Buffer limit reached]'
          truncated = true
        }
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrBuffer.length < MAX_BUFFER_SIZE) {
        stderrBuffer += chunk.toString('utf8')
        if (stderrBuffer.length >= MAX_BUFFER_SIZE) {
          stderrBuffer = stderrBuffer.slice(0, MAX_BUFFER_SIZE) + '\n[Error output truncated: Buffer limit reached]'
          truncated = true
        }
      }
    })

    child.on('error', async (err: Error) => {
      if (isSettled) return
      cleanup()
      const duration = Date.now() - startTime
      await recordUsageEvent({
        projectId: req.projectId,
        userId: req.userId,
        type: 'sandbox_command',
        quantity: 1,
        durationMs: duration,
        metadata: { command: req.command, error: err.message },
      }).catch(() => {})

      resolve({
        command: req.command,
        exitCode: 1,
        stdout: redactSecrets(stdoutBuffer, projectSecrets),
        stderr: redactSecrets(stderrBuffer + `\nExecution error: ${err.message}`, projectSecrets),
        duration,
        status: 'failed',
        error: err.message,
        truncated,
      })
    })

    child.on('close', async (code: number | null) => {
      if (isSettled) return
      cleanup()
      const duration = Date.now() - startTime

      // Sync back any newly created or modified files to database
      await syncDiskFilesToDatabase(req.projectId, req.userId).catch(() => {})

      await recordUsageEvent({
        projectId: req.projectId,
        userId: req.userId,
        type: 'sandbox_command',
        quantity: 1,
        durationMs: duration,
        metadata: { command: req.command, exitCode: code },
      }).catch(() => {})

      resolve({
        command: req.command,
        exitCode: code,
        stdout: redactSecrets(stdoutBuffer, projectSecrets),
        stderr: redactSecrets(stderrBuffer, projectSecrets),
        duration,
        status: code === 0 ? 'success' : 'failed',
        truncated,
      })
    })
  })
}
