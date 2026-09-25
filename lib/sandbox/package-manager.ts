import fs from 'fs'
import path from 'path'
import {
  type PackageInstallRequest,
  type PackageInstallResult,
} from './types'
import { executeSandboxCommand } from './command'
import { getSandboxDirectory, syncProjectFilesToDisk, syncDiskFilesToDatabase } from './fs-sync'
import { db } from '../db/store'

/**
 * Validates package name to prevent arbitrary command injection.
 * Accepts scoped packages (@scope/name) and versions.
 */
export function isValidPackageName(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  return /^(@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+$/.test(trimmed)
}

/**
 * Detects the project package manager by inspecting lockfiles.
 */
export function detectPackageManager(sandboxDir: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (fs.existsSync(path.join(sandboxDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(sandboxDir, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(sandboxDir, 'bun.lockb'))) return 'bun'
  return 'npm'
}

/**
 * Installs an npm package into the isolated project sandbox.
 */
export async function installPackage(
  req: PackageInstallRequest
): Promise<PackageInstallResult> {
  const pkgName = req.packageName.trim()
  if (!isValidPackageName(pkgName)) {
    return {
      success: false,
      packageName: pkgName,
      output: '',
      error: `Invalid package name "${pkgName}". Must be a valid npm package identifier.`,
    }
  }

  // Ensure sandbox files exist
  const sandboxDir = await syncProjectFilesToDisk(req.projectId, req.userId)
  const pm = detectPackageManager(sandboxDir)

  // Construct package specifier
  const specifier = req.version ? `${pkgName}@${req.version}` : pkgName

  let cmd = ''
  if (pm === 'yarn') {
    cmd = `yarn add ${req.dev ? '-D ' : ''}${specifier}`
  } else if (pm === 'pnpm') {
    cmd = `pnpm add ${req.dev ? '-D ' : ''}${specifier}`
  } else if (pm === 'bun') {
    cmd = `bun add ${req.dev ? '-d ' : ''}${specifier}`
  } else {
    cmd = `npm install --no-audit --no-fund ${req.dev ? '--save-dev ' : '--save '}${specifier}`
  }

  const result = await executeSandboxCommand({
    projectId: req.projectId,
    userId: req.userId,
    command: cmd,
    timeoutMs: 90_000,
  })

  // Sync updated package.json back into DB
  const pkgJsonPath = path.join(sandboxDir, 'package.json')
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const content = fs.readFileSync(pkgJsonPath, 'utf8')
      await db.createOrUpdateProjectFile({
        projectId: req.projectId,
        userId: req.userId,
        path: 'package.json',
        name: 'package.json',
        content,
        mimeType: 'application/json',
      })
    } catch {
      // Ignore sync error
    }
  }

  await syncDiskFilesToDatabase(req.projectId, req.userId)

  if (result.status === 'success') {
    return {
      success: true,
      packageName: pkgName,
      dev: req.dev,
      output: result.stdout || result.stderr,
    }
  }

  return {
    success: false,
    packageName: pkgName,
    output: result.stdout,
    error: result.stderr || result.error || 'Package installation failed',
  }
}

/**
 * Returns dependencies and devDependencies from the project's package.json.
 */
export async function getProjectPackages(projectId: string): Promise<{
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}> {
  const file = await db.getProjectFileByPath(projectId, 'package.json')
  if (!file || !file.content) {
    const sandboxDir = getSandboxDirectory(projectId)
    const diskPath = path.join(sandboxDir, 'package.json')
    if (fs.existsSync(diskPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(diskPath, 'utf8'))
        return {
          dependencies: parsed.dependencies || {},
          devDependencies: parsed.devDependencies || {},
        }
      } catch {
        return { dependencies: {}, devDependencies: {} }
      }
    }
    return { dependencies: {}, devDependencies: {} }
  }

  try {
    const parsed = JSON.parse(file.content)
    return {
      dependencies: parsed.dependencies || {},
      devDependencies: parsed.devDependencies || {},
    }
  } catch {
    return { dependencies: {}, devDependencies: {} }
  }
}
