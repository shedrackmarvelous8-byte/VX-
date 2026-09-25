import path from 'path'
import fs from 'fs'
import { type BuildErrorInfo, type BuildResult } from './types'
import { executeSandboxCommand } from './command'
import { syncProjectFilesToDisk, getSandboxDirectory } from './fs-sync'
import { recordUsageEvent } from '../usage/tracker'

/**
 * Parses build stdout and stderr for compiler, typescript, or bundler errors.
 */
export function parseBuildErrors(stdout: string, stderr: string): {
  errors: BuildErrorInfo[]
  warnings: string[]
} {
  const combined = `${stdout}\n${stderr}`
  const lines = combined.split('\n')
  const errors: BuildErrorInfo[] = []
  const warnings: string[] = []

  // Pattern 1: TypeScript compiler errors
  // Example: src/App.tsx(14,5): error TS2322: Type 'string' is not assignable to type 'number'.
  // or: src/App.tsx:14:5 - error TS2322: ...
  const tsRegex = /([a-zA-Z0-9_./-]+\.(?:tsx?|jsx?|vue|svelte|css|json))(?:\((\d+),(\d+)\)|:(\d+):(\d+))(?:\s*-\s*error\s*(TS\d+)?:|\s*:\s*error:)\s*(.*)/i

  // Pattern 2: Vite / Rollup / Webpack plugin error
  // Example: [plugin:vite:react-babel] /path/to/file.tsx: Unexpected token (12:4)
  const bundlerRegex = /(?:\[plugin:[^\]]+\]|Error:)\s*([a-zA-Z0-9_./-]+\.(?:tsx?|jsx?)):\s*(.*?)(?:\((\d+):(\d+)\))?$/i

  // Pattern 3: Module not found / Cannot find module
  const moduleRegex = /(?:Cannot find module|Module not found: Error: Can't resolve)\s*['"]([^'"]+)['"]/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const tsMatch = line.match(tsRegex)
    if (tsMatch) {
      const file = tsMatch[1]
      const lineNum = parseInt(tsMatch[2] || tsMatch[4], 10)
      const colNum = parseInt(tsMatch[3] || tsMatch[5], 10)
      const msg = tsMatch[7] || tsMatch[6] || 'TypeScript error'

      // Grab snippet context from adjacent lines if available
      const snippet = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n')

      errors.push({
        file,
        line: lineNum,
        column: colNum,
        message: msg.trim(),
        codeFrame: snippet,
        type: 'type',
      })
      continue
    }

    const bundlerMatch = line.match(bundlerRegex)
    if (bundlerMatch) {
      const file = bundlerMatch[1]
      const msg = bundlerMatch[2]
      const lineNum = bundlerMatch[3] ? parseInt(bundlerMatch[3], 10) : undefined
      const colNum = bundlerMatch[4] ? parseInt(bundlerMatch[4], 10) : undefined

      errors.push({
        file,
        line: lineNum,
        column: colNum,
        message: msg.trim(),
        type: 'syntax',
      })
      continue
    }

    const modMatch = line.match(moduleRegex)
    if (modMatch) {
      errors.push({
        message: `Missing dependency: Cannot find module "${modMatch[1]}"`,
        type: 'module',
      })
      continue
    }

    if (line.toLowerCase().includes('warning:') || line.toLowerCase().includes('warn -')) {
      warnings.push(line)
    }
  }

  // If there was an exit failure but no specific regex matched, add general error
  if (errors.length === 0 && stderr && stderr.trim()) {
    const cleanedErr = stderr
      .split('\n')
      .filter((l) => !l.includes('npm ERR!') && l.trim())
      .slice(0, 5)
      .join('\n')

    if (cleanedErr) {
      errors.push({
        message: cleanedErr,
        type: 'general',
      })
    }
  }

  return { errors, warnings }
}

/**
 * Builds the project inside its isolated sandbox and captures error diagnostics.
 */
export async function buildProject(
  projectId: string,
  userId: string
): Promise<BuildResult> {
  const sandboxDir = await syncProjectFilesToDisk(projectId, userId)

  // Check if build script exists in package.json
  const pkgPath = path.join(sandboxDir, 'package.json')
  let buildCommand = 'npm run build'

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (!pkg.scripts || !pkg.scripts.build) {
        buildCommand = 'echo "No build script defined in package.json. Build skipped."'
      }
    } catch {
      // Keep default
    }
  }

  const result = await executeSandboxCommand({
    projectId,
    userId,
    command: buildCommand,
    timeoutMs: 60_000,
  })

  await recordUsageEvent({
    projectId,
    userId,
    type: 'build_execution',
    quantity: 1,
    durationMs: result.duration,
    metadata: { exitCode: result.exitCode },
  }).catch(() => {})

  const { errors, warnings } = parseBuildErrors(result.stdout, result.stderr)

  // Scan dist / build folder if created
  const distDir = path.join(sandboxDir, 'dist')
  const distFiles: string[] = []
  if (fs.existsSync(distDir)) {
    try {
      const entries = fs.readdirSync(distDir)
      distFiles.push(...entries)
    } catch {
      // Ignore
    }
  }

  return {
    projectId,
    success: result.exitCode === 0 && errors.length === 0,
    exitCode: result.exitCode,
    duration: result.duration,
    stdout: result.stdout,
    stderr: result.stderr,
    errors,
    warnings,
    distFiles,
  }
}
