import { db } from '../db/store'
import { listProjectTables } from '../project-db/service'
import { inspectProjectBuildErrors } from './errors'
import { extractTextFromAttachment, getRelevantChunks } from './documents'
import type { WorkIntent } from './intent'

export interface ContextAttachmentInput {
  id: string
  name: string
  kind: 'file' | 'image' | 'code'
  mimeType?: string
  data?: string // base64 or text
  url?: string
}

export interface WorkIntelligenceContext {
  systemPrompt: string
  relevantFiles: Array<{ path: string; excerpt: string }>
  relevantSchema?: string
  buildErrorInfo?: string
  documentExcerpts: Array<{ filename: string; text: string }>
  imageAttachments: Array<{ mimeType: string; data: string; name: string }>
}

const WORK_INTELLIGENCE_PROMPT = `You are VX Work Intelligence, an elite senior software architect and genuine intelligent work partner.
You collaborate naturally with the developer before, during, and after development.

CORE OPERATING PRINCIPLES:
1. USER CONTROL & HONESTY:
   - Clearly distinguish between:
     • [USER DECISION]: Something the user explicitly decided.
     • [AI RECOMMENDATION]: Something VX recommends with rationale.
     • [TECHNICAL FACT]: A constraint or requirement supported by the technology.
   - Do NOT invent requirements. If the user asks for a simple website, do not assume they want complex features like payments or dashboards unless requested.
   - Never say "I changed the project" unless an approved execution tool was actually run. Recommendations and analysis do NOT modify files.

2. RESPECTFUL CRITIQUE:
   - If an idea has serious security, performance, cost, or UX flaws (e.g. storing passwords in frontend, unindexed queries, blocking event loops), politely and constructively challenge it, explain the risk, and present better alternatives.

3. STRUCTURED & NATURAL RESPONSES:
   - Simple question → Give a direct, concise answer.
   - Complex task or architectural choice → Structure clearly with:
     • Analysis
     • Options (with trade-offs, complexity, advantages)
     • Recommendation
     • Next Step

4. ACCURACY:
   - Base technical advice on the actual project files, database schema, and build errors provided in context. Never fabricate nonexistent files or errors.
`

export async function buildWorkIntelligenceContext(params: {
  userId: string
  projectId: string
  message: string
  intent: WorkIntent
  attachments?: ContextAttachmentInput[]
}): Promise<WorkIntelligenceContext> {
  const { userId, projectId, message, intent, attachments } = params

  const project = await db.findProjectById(projectId)
  const files = await db.listProjectFiles(projectId)
  const memory = await db.getProjectContextMemory(projectId, userId)

  const relevantFiles: Array<{ path: string; excerpt: string }> = []
  let relevantSchema: string | undefined = undefined
  let buildErrorInfo: string | undefined = undefined
  const documentExcerpts: Array<{ filename: string; text: string }> = []
  const imageAttachments: Array<{ mimeType: string; data: string; name: string }> = []

  // 1. Process attachments
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.kind === 'image' || att.mimeType?.startsWith('image/')) {
        let rawBase64 = att.data || ''
        let mime = att.mimeType || 'image/png'
        if (rawBase64.includes(';base64,')) {
          const parts = rawBase64.split(';base64,')
          mime = parts[0].replace('data:', '') || mime
          rawBase64 = parts[1]
        }
        if (rawBase64) {
          imageAttachments.push({
            mimeType: mime,
            data: rawBase64,
            name: att.name,
          })
        }
      } else if (att.data) {
        // Text / PDF / Document
        const extracted = extractTextFromAttachment(att.name, att.mimeType || 'text/plain', att.data)
        const chunks = getRelevantChunks(extracted, message, 3)
        documentExcerpts.push({
          filename: att.name,
          text: chunks.join('\n...\n'),
        })
      }
    }
  }

  // 2. Selectively retrieve files if query references them or needs architecture
  const lowerMsg = message.toLowerCase()
  for (const f of files) {
    if (f.is_folder) continue
    const baseName = f.name.toLowerCase()

    const isDirectlyReferenced = lowerMsg.includes(baseName) || lowerMsg.includes(f.path.toLowerCase())
    const isCoreConfig = f.path === 'package.json' || f.path === 'README.md'

    if (isDirectlyReferenced || (isCoreConfig && (intent === 'review_request' || intent === 'technical_recommendation'))) {
      const content = f.content || ''
      relevantFiles.push({
        path: f.path,
        excerpt: content.length > 2500 ? content.slice(0, 2500) + '\n... [truncated]' : content,
      })
    }

    if (relevantFiles.length >= 6) break
  }

  // 3. Selectively retrieve database schema if database is mentioned
  if (lowerMsg.includes('database') || lowerMsg.includes('table') || lowerMsg.includes('schema') || lowerMsg.includes('data') || lowerMsg.includes('sql')) {
    try {
      const tables = await listProjectTables(projectId)
      if (tables.length > 0) {
        relevantSchema = tables
          .map((t) => `Table "${t.name}" (${t.rowCount} rows): columns [${t.columns.map((c) => `${c.name} (${c.type})`).join(', ')}]`)
          .join('\n')
      }
    } catch {
      // ignore
    }
  }

  // 4. Retrieve build error info if error or failure is mentioned
  if (intent === 'error_explanation' || lowerMsg.includes('error') || lowerMsg.includes('fail') || lowerMsg.includes('broken')) {
    const errInfo = inspectProjectBuildErrors(projectId)
    if (errInfo.hasError) {
      buildErrorInfo = `${errInfo.summary}\n${errInfo.rawLog || ''}\nSuggested fix: ${errInfo.suggestedFix || ''}`
    }
  }

  // 5. Compose System Prompt with curated context
  let contextSection = `\n\n--- PROJECT CONTEXT ---
Project: ${project?.name || 'VX Project'}
Stack: ${project?.stack || 'Next.js & React'}
Description: ${project?.description || 'None provided'}
Total Project Files: ${files.length}`

  if (memory) {
    if (memory.overview) contextSection += `\nProject Overview: ${memory.overview}`
    if (memory.confirmed_requirements?.length) {
      contextSection += `\nConfirmed Requirements:\n${memory.confirmed_requirements.map((r) => `- ${r}`).join('\n')}`
    }
    if (memory.user_decisions?.length) {
      contextSection += `\nPrevious User Decisions:\n${memory.user_decisions.map((d) => `- ${d}`).join('\n')}`
    }
  }

  if (relevantSchema) {
    contextSection += `\n\nDatabase Schema:\n${relevantSchema}`
  }

  if (buildErrorInfo) {
    contextSection += `\n\nCurrent Build/Runtime Error Information:\n${buildErrorInfo}`
  }

  if (relevantFiles.length > 0) {
    contextSection += `\n\nRelevant Project Files:\n${relevantFiles.map((f) => `File: ${f.path}\n\`\`\`\n${f.excerpt}\n\`\`\``).join('\n\n')}`
  }

  if (documentExcerpts.length > 0) {
    contextSection += `\n\nUploaded Document Excerpts:\n${documentExcerpts.map((d) => `Document: ${d.filename}\n${d.text}`).join('\n\n')}`
  }

  return {
    systemPrompt: `${WORK_INTELLIGENCE_PROMPT}${contextSection}`,
    relevantFiles,
    relevantSchema,
    buildErrorInfo,
    documentExcerpts,
    imageAttachments,
  }
}
