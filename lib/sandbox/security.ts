import path from 'path'

export class SandboxSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SandboxSecurityError'
  }
}

/**
 * Platform secret variable prefixes and exact names that must NEVER leak to sandbox processes.
 */
const FORBIDDEN_ENV_KEYS = new Set([
  'GEMINI_API_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_KEY',
  'OPENROUTER_API_KEY',
  'VERCEL_TOKEN',
  'DATABASE_URL',
  'JWT_SECRET',
  'ADMIN_SECRET',
  'COOKIE_SECRET',
  'BREVO_API_KEY',
  'SENDGRID_API_KEY',
  'STRIPE_SECRET_KEY',
  'AI_STUDIO_API_KEY',
])

/**
 * Returns a sanitized environment object for child processes inside the sandbox.
 * Excludes all infrastructure secrets and includes safe defaults.
 */
export function sanitizeSandboxEnv(
  extraEnv?: Record<string, string>,
  customPort?: number
): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: 'development',
    HOME: '/tmp',
    LANG: 'en_US.UTF-8',
    CI: 'true',
    FORCE_COLOR: '1',
  }

  // Pass non-sensitive system environment variables
  const safeAllowlist = [
    'NODE_PATH',
    'NPM_CONFIG_CACHE',
    'SHELL',
    'TERM',
    'USER',
  ]

  for (const key of safeAllowlist) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key]
    }
  }

  if (customPort) {
    safeEnv.PORT = String(customPort)
    safeEnv.VITE_PORT = String(customPort)
  }

  // Merge extra project-specific env vars while verifying none match forbidden keys
  if (extraEnv) {
    for (const [key, val] of Object.entries(extraEnv)) {
      const upper = key.toUpperCase()
      if (
        FORBIDDEN_ENV_KEYS.has(upper) ||
        upper.includes('SECRET') ||
        upper.includes('TOKEN') ||
        upper.includes('API_KEY') ||
        upper.startsWith('SUPABASE_') ||
        upper.startsWith('AI_STUDIO_')
      ) {
        continue // Skip prohibited secret variable
      }
      safeEnv[key] = String(val)
    }
  }

  return safeEnv
}

/**
 * Validates that a path is strictly confined to the project's sandbox root.
 * Prevents traversal, symlink escapes, and parent directory references.
 */
export function ensureSandboxPath(sandboxRoot: string, targetPath: string): string {
  const resolvedRoot = path.resolve(sandboxRoot)
  const resolvedTarget = path.resolve(sandboxRoot, targetPath)

  const isExactRoot = resolvedTarget === resolvedRoot
  const isInsideRoot = resolvedTarget.startsWith(resolvedRoot + path.sep)

  if (!isExactRoot && !isInsideRoot) {
    throw new SandboxSecurityError(
      `Access denied: path "${targetPath}" attempts to escape sandbox workspace root`
    )
  }

  return resolvedTarget
}

/**
 * Patterns of prohibited dangerous commands, shell metacharacters, or malicious payloads.
 */
const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|-rf|-fr)\s+(\/|~|\$HOME|\.\.\/)/i,
  /:()\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  /\b(mkfs|dd|fdisk|parted)\b/i,
  /\b(shutdown|reboot|poweroff|init\s+0)\b/i,
  /\b(sudo|su|doas|pkexec)\b/i,
  /\b(chown|chmod\s+777\s+\/)\b/i,
  /\/etc\/(passwd|shadow|sudoers)/i,
  /\/proc\/(kcore|mem)/i,
  /\/dev\/(kmem|mem|sda|nvme)/i,
  /\b(curl|wget)\b[^\n|;&]*\|\s*(bash|sh|zsh)/i, // pipe to shell
  /\bnc\s+(-e|-c)\b/i, // netcat reverse shell
  /(`|\$\(.*\)|;\s*cat\b|;\s*rm\b|\|\s*bash\b|\|\s*sh\b)/i, // command substitution & dangerous chaining
]

/**
 * Whitelist prefixes for allowed developer toolchain commands.
 */
const ALLOWED_COMMAND_PREFIXES = [
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bun',
  'node',
  'tsc',
  'vite',
  'next',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'echo',
  'mkdir',
  'cp',
  'mv',
  'rm',
  'pwd',
  'which',
  'git',
  'touch',
]

/**
 * Validates and sanitizes a requested shell command before running in sandbox.
 * Returns null if allowed, or error message string if rejected.
 */
export function validateSandboxCommand(command: string): { allowed: boolean; reason?: string } {
  if (!command || !command.trim()) {
    return { allowed: false, reason: 'Command cannot be empty' }
  }

  const trimmed = command.trim()

  // Check dangerous patterns
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: 'Command rejected: forbidden destructive operation or security violation detected',
      }
    }
  }

  // Extract first word / base command
  const firstToken = trimmed.split(/[\s|;&]+/)[0]
  const baseName = path.basename(firstToken)

  const isAllowedBase = ALLOWED_COMMAND_PREFIXES.includes(baseName)

  if (!isAllowedBase) {
    return {
      allowed: false,
      reason: `Command "${baseName}" is not permitted in the sandbox. Allowed commands include: ${ALLOWED_COMMAND_PREFIXES.slice(0, 10).join(', ')}...`,
    }
  }

  return { allowed: true }
}
