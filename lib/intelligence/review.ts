import { db } from '../db/store'
import type { ProjectReview, ReviewFinding } from '../db/types'

export async function reviewProject(
  projectId: string,
  userId: string,
  scope: ProjectReview['scope'] = 'full'
): Promise<ProjectReview> {
  const project = await db.findProjectById(projectId)
  if (!project || project.user_id !== userId) {
    throw new Error('Project not found or access denied')
  }

  const files = await db.listProjectFiles(projectId)
  const findings: ReviewFinding[] = []

  // 1. Inspect package.json & dependencies
  const pkgFile = files.find((f) => f.path === 'package.json' || f.path === '/package.json')
  let pkgData: any = null
  if (pkgFile?.content) {
    try {
      pkgData = JSON.parse(pkgFile.content)
    } catch {
      findings.push({
        category: 'Architecture',
        observation: 'package.json is malformed or contains syntax errors.',
        recommendation: 'Format package.json to ensure valid JSON syntax for reliable package management.',
        action: 'Repair syntax in package.json',
        severity: 'high',
      })
    }
  }

  // 2. UI & Responsiveness Checks
  const cssFiles = files.filter((f) => f.path.endsWith('.css'))
  const componentFiles = files.filter(
    (f) => f.path.endsWith('.tsx') || f.path.endsWith('.jsx') || f.path.endsWith('.html')
  )

  const hasViewportMeta = componentFiles.some(
    (f) => f.content?.includes('viewport') || f.content?.includes('width=device-width')
  )

  if (!hasViewportMeta && files.length > 3) {
    findings.push({
      category: 'Responsiveness',
      observation: 'Missing mobile viewport meta tag in main HTML/layout.',
      recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0" /> to ensure proper scaling on mobile devices.',
      action: 'Add viewport meta tag to root layout',
      severity: 'medium',
    })
  }

  // 3. Accessibility Checks
  const imgWithoutAlt = componentFiles.filter(
    (f) => f.content && /<img\s+(?![^>]*\balt=)[^>]*>/i.test(f.content)
  )
  if (imgWithoutAlt.length > 0) {
    findings.push({
      category: 'Accessibility',
      observation: `Found <img> tags without alt attributes in ${imgWithoutAlt.map((f) => f.name).join(', ')}.`,
      recommendation: 'Always provide descriptive alt attributes for screen reader accessibility.',
      action: 'Add alt attributes to image tags',
      severity: 'low',
    })
  }

  // 4. Security Checks
  const secretPatterns = [
    { name: 'Hardcoded API Key', regex: /(?:sk_live_|ghp_|AIzaSy)[a-zA-Z0-9_-]{16,}/ },
    { name: 'Plaintext Password', regex: /password\s*[:=]\s*['"][^'"]{4,}['"]/i },
  ]

  for (const f of componentFiles) {
    if (!f.content) continue
    for (const pat of secretPatterns) {
      if (pat.regex.test(f.content)) {
        findings.push({
          category: 'Security',
          observation: `Potential ${pat.name} detected in ${f.path}.`,
          recommendation: 'Store sensitive keys in Environment Variables rather than hardcoding them in frontend files.',
          action: `Move secret to .env and reference via process.env`,
          severity: 'high',
        })
      }
    }
  }

  // 5. Architecture & File Structure Checks
  if (componentFiles.length > 10 && !files.some((f) => f.path.includes('/components/'))) {
    findings.push({
      category: 'Architecture',
      observation: 'Components are not organized into dedicated modular subdirectories.',
      recommendation: 'Organize reusable UI elements into a `src/components/` folder for maintainability.',
      action: 'Restructure components into dedicated directories',
      severity: 'low',
    })
  }

  // 6. Error Handling Checks
  const fetchCallsWithoutCatch = componentFiles.filter(
    (f) => f.content && /fetch\([^)]+\)(?!\s*\.catch)/.test(f.content) && !f.content.includes('try {')
  )
  if (fetchCallsWithoutCatch.length > 0) {
    findings.push({
      category: 'Performance',
      observation: `Network requests without error boundaries detected in ${fetchCallsWithoutCatch.slice(0, 3).map((f) => f.name).join(', ')}.`,
      recommendation: 'Wrap fetch requests in try/catch blocks or handle errors with UI error states.',
      action: 'Add error handling to asynchronous fetch calls',
      severity: 'medium',
    })
  }

  // If project is clean and minimal issues found
  if (findings.length === 0) {
    findings.push({
      category: 'UI & UX',
      observation: 'Project structure and components conform to standards with clean formatting.',
      recommendation: 'Consider adding automated tests and accessibility audit checks as the project scales.',
      action: 'Optional: Add unit tests or component tests',
      severity: 'low',
    })
  }

  const summary = `Project review completed with ${findings.length} findings: ${
    findings.filter((f) => f.severity === 'high').length
  } high priority, ${findings.filter((f) => f.severity === 'medium').length} medium, and ${
    findings.filter((f) => f.severity === 'low').length
  } suggestions.`

  const review = await db.createProjectReview({
    projectId,
    userId,
    scope,
    findings,
    summary,
  })

  return review
}
