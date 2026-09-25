import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { getDevServerStatus } from './dev-server'
import { getSandboxDirectory, syncProjectFilesToDisk } from './fs-sync'
import { db } from '../db/store'
import { getAuthenticatedUser } from '../auth/server'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export async function handlePreviewRequest(
  req: NextRequest,
  projectId: string,
  subpath = ''
): Promise<NextResponse> {
  // 1. Authenticate user and verify project ownership
  const user = await getAuthenticatedUser(req)
  if (!user) {
    return new NextResponse('Unauthorized: Authentication required for preview', { status: 401 })
  }

  const project = await db.findProjectById(projectId)
  if (!project || project.user_id !== user.id) {
    return new NextResponse('Project not found or access denied', { status: 404 })
  }

  const requestOrigin = req.headers.get('origin') || ''
  const allowedOrigin = requestOrigin || '*'

  const devServer = getDevServerStatus(projectId)

  // 2. If dev server is running, reverse-proxy the request to 127.0.0.1:port
  if (devServer.status === 'running' && devServer.port) {
    try {
      const targetUrl = new URL(`http://127.0.0.1:${devServer.port}/${subpath}`)
      req.nextUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val)
      })

      const proxyRes = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: {
          Accept: req.headers.get('accept') || '*/*',
          'User-Agent': req.headers.get('user-agent') || 'VX-Preview-Proxy',
        },
        cache: 'no-store',
      })

      const responseHeaders = new Headers()
      proxyRes.headers.forEach((val, key) => {
        const lower = key.toLowerCase()
        // Do not forward frame-busting or origin restricting headers
        if (
          lower !== 'x-frame-options' &&
          lower !== 'content-security-policy' &&
          lower !== 'transfer-encoding'
        ) {
          responseHeaders.set(key, val)
        }
      })

      // Frame isolation & restricted origin header
      responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin)
      responseHeaders.set('X-Content-Type-Options', 'nosniff')

      const body = await proxyRes.arrayBuffer()
      return new NextResponse(body, {
        status: proxyRes.status,
        headers: responseHeaders,
      })
    } catch {
      // If proxy fetch failed, fall through to static sandbox fallback
    }
  }

  // 3. Static file fallback directly from sandbox workspace
  const sandboxDir = getSandboxDirectory(projectId)
  if (!fs.existsSync(sandboxDir)) {
    // Attempt auto-initialization from DB
    await syncProjectFilesToDisk(projectId, user.id).catch(() => {})
  }

  let cleanSubpath = subpath ? subpath.replace(/^\/+/, '') : ''
  if (!cleanSubpath || cleanSubpath === '/') {
    cleanSubpath = 'index.html'
  }

  const filePath = path.resolve(sandboxDir, cleanSubpath)
  const resolvedRoot = path.resolve(sandboxDir)

  // Strict boundary check: must equal root or start with root + path.sep
  const isExact = filePath === resolvedRoot
  const isSub = filePath.startsWith(resolvedRoot + path.sep)

  if (!isExact && !isSub) {
    return new NextResponse('Access denied: Path attempts to escape sandbox workspace', { status: 403 })
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'text/plain; charset=utf-8'
    const fileBytes = fs.readFileSync(filePath)

    return new NextResponse(fileBytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': allowedOrigin,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Check if index.html can be served for SPA client routing
  const indexPath = path.join(sandboxDir, 'index.html')
  if (fs.existsSync(indexPath) && (!path.extname(cleanSubpath) || cleanSubpath.endsWith('.html'))) {
    const htmlContent = fs.readFileSync(indexPath, 'utf8')
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': allowedOrigin,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Fallback: If no files on disk, check DB for index.html or project info
  const dbIndex = await db.getProjectFileByPath(projectId, 'index.html')
  if (dbIndex && dbIndex.content) {
    return new NextResponse(dbIndex.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': allowedOrigin,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  const defaultPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name || 'VX Project'} - Live Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      text-align: center;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 32px;
      max-width: 480px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      background: #1f6feb;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }
    h2 { margin: 0 0 8px 0; color: #58a6ff; font-size: 22px; }
    p { color: #8b949e; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0; }
    .status-row {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #21262d;
      padding-top: 16px;
      font-size: 12px;
      color: #7ee787;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Development Environment</div>
    <h2>${project.name || 'Project Live Preview'}</h2>
    <p>Project sandbox is ready. Start the development server or generate code to see real-time updates.</p>
    <div class="status-row">
      <span>Status: Standby</span>
      <span>Port: Ready</span>
    </div>
  </div>
</body>
</html>`

  return new NextResponse(defaultPage, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': allowedOrigin,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
