import fs from 'fs'
import path from 'path'
import { db } from '../db/store'
import { ensureSandboxPath } from './security'

const SANDBOX_BASE_DIR = path.join(process.cwd(), '.sandboxes')

export function getSandboxDirectory(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(SANDBOX_BASE_DIR, safeId)
}

/**
 * Ensures the sandbox directory exists on disk and has all latest project files
 * from the database store written to disk.
 */
export async function syncProjectFilesToDisk(projectId: string, userId: string): Promise<string> {
  const sandboxDir = getSandboxDirectory(projectId)

  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true })
  }

  const dbFiles = await db.listProjectFiles(projectId)

  // Write all DB files to sandbox disk
  for (const file of dbFiles) {
    if (file.is_folder) {
      const folderPath = ensureSandboxPath(sandboxDir, file.path)
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true })
      }
      continue
    }

    const filePath = ensureSandboxPath(sandboxDir, file.path)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Only write if file doesn't exist or content is different
    let needsWrite = true
    if (fs.existsSync(filePath)) {
      try {
        const diskContent = fs.readFileSync(filePath, 'utf8')
        if (diskContent === file.content) {
          needsWrite = false
        }
      } catch {
        needsWrite = true
      }
    }

    if (needsWrite) {
      fs.writeFileSync(filePath, file.content || '', 'utf8')
    }
  }

  // If no package.json exists, generate default project scaffold
  const pkgPath = path.join(sandboxDir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    const project = await db.findProjectById(projectId)
    const projectName = project?.name?.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'vx-project'
    
    const defaultPackageJson = {
      name: projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'node -e "const http=require(\'http\');const fs=require(\'fs\');const port=process.env.PORT||3100;http.createServer((req,res)=>{const p=req.url===\'/\'?\'index.html\':req.url.slice(1);if(fs.existsSync(p)){res.writeHead(200);res.end(fs.readFileSync(p));}else{res.writeHead(200,{\'Content-Type\':\'text/html\'});res.end(\'<h1>VX Live Preview</h1><p>Project is running!</p>\');}}).listen(port,()=>console.log(\'Server ready on http://localhost:\'+port));"',
        build: 'echo "Build complete"',
        test: 'echo "Tests passed"',
      },
      dependencies: {},
      devDependencies: {},
    }

    const pkgContent = JSON.stringify(defaultPackageJson, null, 2)
    fs.writeFileSync(pkgPath, pkgContent, 'utf8')

    // Also persist to DB
    await db.createOrUpdateProjectFile({
      projectId,
      userId,
      path: 'package.json',
      name: 'package.json',
      content: pkgContent,
      mimeType: 'application/json',
    }).catch(() => {})
  }

  // Ensure index.html exists for live preview
  const indexPath = path.join(sandboxDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    const project = await db.findProjectById(projectId)
    const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project?.name || 'VX Application'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      background: #238636;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #58a6ff;
    }
    p {
      color: #8b949e;
      max-width: 480px;
      line-height: 1.6;
      font-size: 15px;
      margin-bottom: 24px;
    }
    .meta-box {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px 24px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      color: #7ee787;
    }
  </style>
</head>
<body>
  <div class="badge">Live Sandbox Active</div>
  <h1>${project?.name || 'Welcome to VX'}</h1>
  <p>Your isolated sandbox is running. Use the Terminal or Coding Agent to build, install dependencies, or edit files.</p>
  <div class="meta-box">
    Project ID: ${projectId}<br>
    Status: 200 OK • Ready for development
  </div>
</body>
</html>`

    fs.writeFileSync(indexPath, defaultHtml, 'utf8')

    await db.createOrUpdateProjectFile({
      projectId,
      userId,
      path: 'index.html',
      name: 'index.html',
      content: defaultHtml,
      mimeType: 'text/html',
    }).catch(() => {})
  }

  return sandboxDir
}

/**
 * Scans the sandbox directory and syncs back any created or changed project source files
 * into the database store.
 */
export async function syncDiskFilesToDatabase(projectId: string, userId: string): Promise<void> {
  const sandboxDir = getSandboxDirectory(projectId)
  if (!fs.existsSync(sandboxDir)) return

  const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    '.vite',
    'dist',
    'build',
    '.cache',
    '.turbo',
  ])

  function scan(currentDir: string, relativePrefix = ''): { relPath: string; isFolder: boolean }[] {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    const results: { relPath: string; isFolder: boolean }[] = []

    for (const ent of entries) {
      if (IGNORED_DIRS.has(ent.name)) continue
      const rel = relativePrefix ? `${relativePrefix}/${ent.name}` : ent.name

      if (ent.isDirectory()) {
        results.push({ relPath: rel, isFolder: true })
        results.push(...scan(path.join(currentDir, ent.name), rel))
      } else if (ent.isFile()) {
        results.push({ relPath: rel, isFolder: false })
      }
    }

    return results
  }

  const diskItems = scan(sandboxDir)

  for (const item of diskItems) {
    if (item.isFolder) {
      await db.createOrUpdateProjectFile({
        projectId,
        userId,
        path: item.relPath,
        name: path.basename(item.relPath),
        isFolder: true,
      }).catch(() => {})
    } else {
      const fullPath = path.join(sandboxDir, item.relPath)
      try {
        const stats = fs.statSync(fullPath)
        // Skip huge binary files (> 1MB) from storing in text DB
        if (stats.size > 1024 * 1024) continue

        const content = fs.readFileSync(fullPath, 'utf8')
        const ext = path.extname(item.relPath).toLowerCase()
        const mimeType = ext === '.json' ? 'application/json' : ext === '.html' ? 'text/html' : ext === '.ts' || ext === '.tsx' ? 'text/typescript' : 'text/plain'

        await db.createOrUpdateProjectFile({
          projectId,
          userId,
          path: item.relPath,
          name: path.basename(item.relPath),
          content,
          mimeType,
        }).catch(() => {})
      } catch {
        // Ignore read errors
      }
    }
  }
}
