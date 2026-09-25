import { aiRouter } from '../ai/router'
import { AGENT_TOOLS, executeAgentTool, type AgentContext } from './tools'
import { db } from '../db/store'

export interface CodingAgentRequest {
  userId: string
  projectId: string
  conversationId: string
  message: string
  modelId?: string
  onActivity?: (activity: { type: string; title: string; detail?: string; file?: string }) => void
}

export interface CodingAgentResult {
  runId: string
  summary: string
  filesCreated: string[]
  filesModified: string[]
  filesDeleted: string[]
  iterations: number
  status: 'completed' | 'failed' | 'requires_approval'
}

export async function runCodingAgent(req: CodingAgentRequest): Promise<CodingAgentResult> {
  const modelId = req.modelId || 'auto'
  const run = await db.createAgentRun({
    userId: req.userId,
    projectId: req.projectId,
    conversationId: req.conversationId,
    modelId,
  })

  req.onActivity?.({
    type: 'inspecting',
    title: 'Analyzing workspace',
    detail: 'Initializing Coding Agent',
  })

  // Take a project snapshot prior to agent edits
  await db.createProjectSnapshot({
    projectId: req.projectId,
    userId: req.userId,
    conversationId: req.conversationId,
    description: `Pre-agent snapshot for run ${run.id}: "${req.message.slice(0, 40)}"`,
  }).catch(() => {})

  const createdFilesSet = new Set<string>()
  const modifiedFilesSet = new Set<string>()
  const deletedFilesSet = new Set<string>()

  const MAX_ITERATIONS = 10
  let iteration = 0
  let isDone = false
  let finalSummary = ''

  const ctx: AgentContext = {
    runId: run.id,
    userId: req.userId,
    projectId: req.projectId,
    conversationId: req.conversationId,
    onActivity: req.onActivity,
  }

  // Retrieve current files list as context prompt
  const initialFiles = await db.listProjectFiles(req.projectId)
  const fileListText = initialFiles.length === 0
    ? 'Project currently has no files.'
    : `Project Files:\n${initialFiles.map((f) => `- ${f.path} (${f.is_folder ? 'folder' : `${f.size} bytes`})`).join('\n')}`

  const project = await db.findProjectById(req.projectId)
  const projectTarget = project?.target || 'web'

  let systemInstructions = `You are the VX Coding Agent.
Project Target Platform: ${projectTarget.toUpperCase()} (${projectTarget === 'mobile' ? 'Expo & React Native Mobile App' : projectTarget === 'web_mobile' ? 'Web + Mobile Project' : 'Web Application'})
Your task: ${req.message}

${fileListText}

Mobile Development Guidelines (if working on mobile or web_mobile):
- Understand React Native components (View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView).
- Follow Expo conventions (app.json, package.json, React Native source files).
- Handle device navigation (Stack, Tab, Drawer), safe areas, status bar, and Android touch/keyboard behaviors.
- NEVER embed private server secrets (GEMINI_API_KEY, OPENROUTER_API_KEY, SUPABASE_SECRET_KEY, VERCEL_TOKEN, etc.) in mobile client code. Use public client keys only.
- Ensure proper error handling, network timeouts, and offline states.

Available Tools:
${AGENT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Guidelines:
1. Always inspect or list files before editing.
2. Read target files before attempting edit_file.
3. Make concise, high-quality targeted code modifications.
4. You have access to a real, isolated sandbox execution environment via run_command, install_package, build_project, and start_dev_server.
5. Use install_package to add required dependencies to package.json.
6. Use build_project to verify syntax, TypeScript types, and bundle output.
7. Use start_dev_server to verify the application preview is running.
8. You have access to project-scoped database tools (list_database_tables, read_table_schema, create_table, add_column, read_database, insert_database_row, run_database_migration). Always inspect existing schema before adding tables or migrations.
9. You have access to environment variable tools (list_environment_variables, create_environment_variable, update_environment_variable, get_environment_variable_metadata).
10. When done, output a summary starting with "Build task completed: ..." or "Task complete: ..."
`

  while (!isDone && iteration < MAX_ITERATIONS) {
    iteration++

    // Ask model via AI Router
    const routerRes = await aiRouter.routeGenerate({
      userId: req.userId,
      conversationId: req.conversationId,
      projectId: req.projectId,
      modelId: req.modelId,
      message: `[Iteration ${iteration}] ${req.message}`,
      additionalSystemInstructions: systemInstructions,
    })

    const responseText = routerRes.text || ''

    // Parse potential tool call from text if standard formatted JSON block
    const toolCallMatch = responseText.match(/```tool_call\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*"tool"\s*:\s*"([^"]+)"[\s\S]*\}/)

    if (toolCallMatch) {
      try {
        const rawJson = toolCallMatch[1] || toolCallMatch[0]
        const parsed = JSON.parse(rawJson)
        const toolName = parsed.tool || parsed.name || parsed.action
        const toolArgs = parsed.args || parsed.parameters || parsed.input || {}

        if (toolName && typeof toolName === 'string') {
          const result = await executeAgentTool(toolName, toolArgs, ctx)

          // Track modified/created files
          const targetPath = String(toolArgs.path || toolArgs.oldPath || '')
          if (toolName === 'create_file' || toolName === 'create_folder') {
            if (targetPath) createdFilesSet.add(targetPath)
          } else if (toolName === 'write_file' || toolName === 'edit_file') {
            if (targetPath) modifiedFilesSet.add(targetPath)
          } else if (toolName === 'delete_file') {
            if (targetPath) deletedFilesSet.add(targetPath)
          }

          systemInstructions += `\n[Tool Executed]: ${toolName}\n[Args]: ${JSON.stringify(toolArgs)}\n[Result]: ${JSON.stringify(result)}\n`
          continue
        }
      } catch {
        // Fall back to treat as text response
      }
    }

    // Default or final text output
    finalSummary = responseText
    isDone = true
  }

  const status = isDone ? 'completed' : 'requires_approval'
  const summary = finalSummary || `Coding agent completed task after ${iteration} iterations.`

  await db.updateAgentRun(run.id, {
    status,
    summary,
  })

  req.onActivity?.({
    type: 'complete',
    title: 'Build task completed',
    detail: `${createdFilesSet.size} created, ${modifiedFilesSet.size} modified, ${deletedFilesSet.size} deleted`,
  })

  return {
    runId: run.id,
    summary,
    filesCreated: Array.from(createdFilesSet),
    filesModified: Array.from(modifiedFilesSet),
    filesDeleted: Array.from(deletedFilesSet),
    iterations: iteration,
    status,
  }
}
