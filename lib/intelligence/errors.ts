import fs from 'fs'
import path from 'path'
import { getSandboxDirectory } from '../sandbox/fs-sync'

export interface BuildErrorInfo {
  hasError: boolean
  rawLog?: string
  summary: string
  errorType?: 'build' | 'type' | 'syntax' | 'dependency' | 'runtime' | 'database'
  detectedFile?: string
  line?: number
  suggestedFix?: string
}

export function inspectProjectBuildErrors(projectId: string): BuildErrorInfo {
  const sandboxDir = getSandboxDirectory(projectId)
  const buildLogPath = path.join(sandboxDir, 'build.log')
  const devLogPath = path.join(sandboxDir, 'dev.log')

  let rawLog = ''
  if (fs.existsSync(buildLogPath)) {
    try {
      rawLog = fs.readFileSync(buildLogPath, 'utf8')
    } catch {
      // ignore
    }
  }

  if (!rawLog && fs.existsSync(devLogPath)) {
    try {
      rawLog = fs.readFileSync(devLogPath, 'utf8')
    } catch {
      // ignore
    }
  }

  if (!rawLog) {
    return {
      hasError: false,
      summary: 'No active build errors or log failures detected in project sandbox.',
    }
  }

  // Parse common Next.js / TypeScript / Vite / Node.js errors
  let errorType: BuildErrorInfo['errorType'] = 'build'
  let detectedFile: string | undefined = undefined
  let line: number | undefined = undefined
  let summary = 'Build encountered an issue during execution.'
  let suggestedFix = 'Inspect recent code changes and verify dependencies.'

  if (rawLog.includes('Type error:') || rawLog.includes('TS')) {
    errorType = 'type'
    summary = 'TypeScript type checking failed.'
    const fileMatch = rawLog.match(/(?:.\/|\/)([\w\-./]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)/)
    if (fileMatch) {
      detectedFile = fileMatch[1]
      line = parseInt(fileMatch[2], 10)
      summary = `TypeScript error in ${detectedFile} at line ${line}.`
    }
    suggestedFix = 'Verify property types and ensure required interface properties are supplied.'
  } else if (rawLog.includes('Module not found:') || rawLog.includes('Cannot find module') || rawLog.includes('ENOENT')) {
    errorType = 'dependency'
    summary = 'Missing import or dependency.'
    suggestedFix = 'Install the missing package or verify the relative import path.'
  } else if (rawLog.includes('SyntaxError:')) {
    errorType = 'syntax'
    summary = 'JavaScript/TypeScript syntax error.'
    suggestedFix = 'Check for unmatched brackets, missing commas, or unclosed tags.'
  }

  return {
    hasError: true,
    rawLog: rawLog.slice(-1500),
    summary,
    errorType,
    detectedFile,
    line,
    suggestedFix,
  }
}
