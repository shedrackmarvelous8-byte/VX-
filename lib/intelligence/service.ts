import { db } from '../db/store'
import { aiRouter } from '../ai/router'
import { runCodingAgent } from '../agent/service'
import { classifyUserIntent, type IntentAnalysisResult } from './intent'
import { buildWorkIntelligenceContext, type ContextAttachmentInput } from './context'
import { reviewProject } from './review'
import { generateProjectDocument } from './notes'
import { extractKeyRequirements } from './documents'
import type { StandardChatMessage } from '../ai/context'
import type { ModelDefinition } from '../ai/models'

export interface WorkIntelligenceRequest {
  userId: string
  conversationId: string
  message: string
  modelId?: string
  stream?: boolean
  attachments?: ContextAttachmentInput[]
  isCodingTaskExplicit?: boolean
}

export interface WorkIntelligenceResponse {
  intent: IntentAnalysisResult
  text: string
  model: {
    id: string
    name: string
    actualModel?: string
  }
  agentResult?: any
  generatedDocument?: any
  reviewResult?: any
}

export async function processWorkIntelligenceMessage(
  params: WorkIntelligenceRequest,
  onStreamChunk?: (chunk: string) => Promise<void> | void
): Promise<WorkIntelligenceResponse> {
  const { userId, conversationId, message, modelId, stream = true, attachments, isCodingTaskExplicit } = params

  const convo = await db.findConversationById(conversationId)
  if (!convo || convo.user_id !== userId) {
    throw new Error('Conversation not found or access denied')
  }

  const projectId = convo.project_id
  const hasAttachments = Boolean(attachments && attachments.length > 0)

  // 1. Classify Intent
  let intentResult = classifyUserIntent(message, hasAttachments)
  if (isCodingTaskExplicit) {
    intentResult = {
      intent: 'implementation_request',
      confidence: 1.0,
      isCodingExecutionAllowed: true,
      explanation: 'User explicitly requested coding implementation mode.',
    }
  }

  // 2. If it's a coding implementation command and execution is allowed -> Run Coding Agent
  if (intentResult.intent === 'implementation_request' && intentResult.isCodingExecutionAllowed) {
    const { model, actualModel } = await aiRouter.resolveModel(modelId, { isCodingTask: true })
    const agentResult = await runCodingAgent({
      userId,
      projectId,
      conversationId,
      message,
      modelId: model.id,
    })

    let finalContent = agentResult.summary
    if (
      agentResult.filesCreated.length > 0 ||
      agentResult.filesModified.length > 0 ||
      agentResult.filesDeleted.length > 0
    ) {
      finalContent += `\n\n**Agent Changes:**\n`
      if (agentResult.filesCreated.length) finalContent += `- **Created:** ${agentResult.filesCreated.join(', ')}\n`
      if (agentResult.filesModified.length) finalContent += `- **Modified:** ${agentResult.filesModified.join(', ')}\n`
      if (agentResult.filesDeleted.length) finalContent += `- **Deleted:** ${agentResult.filesDeleted.join(', ')}\n`
    }

    if (onStreamChunk) {
      await onStreamChunk(finalContent)
    }

    return {
      intent: intentResult,
      text: finalContent,
      model: { id: model.id, name: model.name, actualModel: actualModel.name },
      agentResult,
    }
  }

  // 3. Document Generation Shortcut
  let generatedDocument: any = undefined
  if (intentResult.intent === 'document_generation') {
    const docType = /requirements/i.test(message)
      ? 'requirements'
      : /technical|architecture/i.test(message)
      ? 'technical_spec'
      : 'project_brief'

    try {
      generatedDocument = await generateProjectDocument({
        projectId,
        userId,
        docType,
      })
    } catch {
      // ignore
    }
  }

  // 4. Build Curated Work Intelligence Context
  const context = await buildWorkIntelligenceContext({
    userId,
    projectId,
    message,
    intent: intentResult.intent,
    attachments,
  })

  // 5. Route to AI Model
  const hasImages = context.imageAttachments.length > 0
  const { model, actualModel } = await aiRouter.resolveModel(modelId, {
    hasImages,
    isCodingTask: false,
  })

  // Format messages including standard conversation history and multimodal image data
  const standardMessages: StandardChatMessage[] = (
    await db.listMessagesByConversation(conversationId, userId, { limit: 10 })
  ).map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))

  // Add images to last user message if any
  if (hasImages && standardMessages.length > 0) {
    const lastMsg = standardMessages[standardMessages.length - 1]
    if (lastMsg.role === 'user') {
      lastMsg.images = context.imageAttachments
    }
  }

  let finalResponseText = ''

  if (stream && onStreamChunk) {
    const result = await aiRouter.routeStream(
      {
        conversationId,
        userId,
        message,
        modelId: model.id,
        additionalSystemInstructions: context.systemPrompt,
      },
      async (chunk) => {
        finalResponseText += chunk
        await onStreamChunk(chunk)
      }
    )
    finalResponseText = result.text || finalResponseText
  } else {
    const result = await aiRouter.routeGenerate({
      conversationId,
      userId,
      message,
      modelId: model.id,
      additionalSystemInstructions: context.systemPrompt,
    })
    finalResponseText = result.text
  }

  // 6. Update Project Context Memory with extracted requirements or decisions
  if (intentResult.intent === 'document_analysis' || intentResult.intent === 'technical_recommendation') {
    const reqs = extractKeyRequirements(finalResponseText)
    if (reqs.length > 0) {
      await db.updateProjectContextMemory(projectId, userId, {
        confirmed_requirements: reqs,
      }).catch(() => null)
    }
  }

  return {
    intent: intentResult,
    text: finalResponseText,
    model: { id: model.id, name: model.name, actualModel: actualModel.name },
    generatedDocument,
  }
}
