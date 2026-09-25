import { db } from '../db/store'
import type { NoteCategory, ProjectNote } from '../db/types'

export interface GeneratedDocument {
  id: string
  title: string
  docType: 'project_brief' | 'requirements' | 'technical_spec' | 'summary' | 'notes'
  markdown: string
  html: string
  createdAt: string
}

export async function createProjectNote(params: {
  projectId: string
  userId: string
  title: string
  category: NoteCategory
  content: string
}): Promise<ProjectNote> {
  return await db.createProjectNote(params)
}

export async function listProjectNotes(
  projectId: string,
  userId: string
): Promise<ProjectNote[]> {
  return await db.listProjectNotes(projectId, userId)
}

export async function updateProjectNote(
  noteId: string,
  userId: string,
  updates: Partial<Pick<ProjectNote, 'title' | 'category' | 'content'>>
): Promise<ProjectNote | null> {
  return await db.updateProjectNote(noteId, userId, updates)
}

export async function deleteProjectNote(
  noteId: string,
  userId: string
): Promise<boolean> {
  return await db.deleteProjectNote(noteId, userId)
}

/**
 * Generates formatted project documents (Project Brief, Requirements, Technical Spec)
 * saved to persistent project notes and exportable as printable document/PDF HTML.
 */
export async function generateProjectDocument(params: {
  projectId: string
  userId: string
  docType: GeneratedDocument['docType']
  title?: string
  customContent?: string
}): Promise<GeneratedDocument> {
  const { projectId, userId, docType } = params
  const project = await db.findProjectById(projectId)
  const projectName = project?.name || 'Project'
  const files = await db.listProjectFiles(projectId)
  const notes = await db.listProjectNotes(projectId, userId)

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let title = params.title || ''
  let markdown = ''

  if (docType === 'project_brief') {
    title = title || `${projectName} — Project Brief`
    markdown = `# ${title}
**Date:** ${dateStr}  
**Author:** VX Intelligent Development Workspace  
**Status:** Approved Specification  

---

## 1. Executive Summary
${project?.description || `The ${projectName} project is designed to deliver a modern, high-performance web experience tailored to user needs.`}

## 2. Core Objectives
- Deliver a clean, intuitive, and responsive interface across mobile and desktop viewports.
- Maintain high security standards with strict environment variable isolation.
- Ensure performant and scalable code architecture.

## 3. Scope of Work
- **Frontend:** Modern interactive UI components and design system.
- **Backend & Database:** Project-scoped database and authenticated API services.
- **Integrations:** Version control via GitHub and continuous deployments on Vercel.

## 4. Key Milestones
1. Initial Architecture & Wireframes
2. Core Features & Database Schema Setup
3. User Flow Verification & Testing
4. Production Deployment & Monitoring
`
  } else if (docType === 'requirements') {
    title = title || `${projectName} — Requirements Specification`
    markdown = `# ${title}
**Date:** ${dateStr}  
**Project:** ${projectName}  

---

## 1. Functional Requirements
- **FR-1 (User Experience):** The application must be fully responsive on mobile and desktop screens.
- **FR-2 (Data Management):** Support data CRUD operations with strict project boundary isolation.
- **FR-3 (Security):** All sensitive API keys and tokens must be encrypted and excluded from client bundles.

## 2. Non-Functional Requirements
- **Performance:** Sub-second page rendering and lightweight bundle footprints.
- **Reliability:** Graceful error recovery and informative status feedback.
- **Maintainability:** Modular component hierarchy and clean separation of concerns.

## 3. Assumptions & Constraints
- Operates in modern evergreen browsers.
- Adheres to WCAG AA accessibility contrast guidelines.
`
  } else if (docType === 'technical_spec') {
    title = title || `${projectName} — Technical Architecture Specification`
    markdown = `# ${title}
**Date:** ${dateStr}  
**Architecture:** Modern Web Application  

---

## 1. Technology Stack
- **Framework:** Next.js with App Router
- **Styling:** Tailwind CSS with dark-mode first design
- **State Management:** React hooks & server-state synchronization
- **Storage:** Isolated project database & encrypted vault

## 2. File Organization
\`\`\`
src/
├── components/   # Modular reusable UI components
├── lib/          # Service layer & data abstractions
└── types/        # TypeScript interface definitions
\`\`\`

## 3. Security Guidelines
- Never commit \`.env\` or secret tokens to source control.
- Enforce strict server-side authentication for all database queries.
`
  } else {
    title = title || `${projectName} — Project Summary`
    markdown = `# ${title}
**Date:** ${dateStr}  
**Files Tracked:** ${files.length}  
**Notes Recorded:** ${notes.length}  

---

## Project Overview
Summary of current progress and technical decisions recorded in VX Work Intelligence.
`
  }

  if (params.customContent) {
    markdown += `\n\n## Additional Notes\n${params.customContent}\n`
  }

  // Convert markdown to clean, printable HTML document
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; color: #111; }
    h1 { font-size: 26px; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; padding-bottom: 4px; }
    p, li { font-size: 14px; color: #333; }
    pre, code { background: #f5f5f5; padding: 3px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
    @media print { body { margin: 0; padding: 0; } }
  </style>
</head>
<body>
  <div>${markdown.replace(/\n/g, '<br>')}</div>
</body>
</html>`

  // Save generated document as a note in project
  const note = await db.createProjectNote({
    projectId,
    userId,
    title,
    category: docType === 'requirements' ? 'requirements' : docType === 'technical_spec' ? 'technical' : 'project_notes',
    content: markdown,
  })

  return {
    id: note.id,
    title,
    docType,
    markdown,
    html,
    createdAt: new Date().toISOString(),
  }
}
