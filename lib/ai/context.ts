import { db } from '@/lib/db/store'
import type { MessageRecord } from '@/lib/db/types'

export interface StandardChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: Array<{ mimeType: string; data: string }>
}

export interface ConversationContextResult {
  systemPrompt: string
  messages: StandardChatMessage[]
}

const DEFAULT_SYSTEM_PROMPT = `You are VX, a premier AI software engineering platform and assistant.
You provide precise, clean, highly modular, modern code, thorough architecture plans, and direct solutions.
Focus on correctness, maintainability, and clean code principles.
When writing code snippets, specify the filename or language tag clearly.
Be concise, proactive, and direct.`

export async function buildConversationContext(params: {
  conversationId: string
  userId: string
  additionalSystemInstructions?: string
  maxTurns?: number
}): Promise<ConversationContextResult> {
  const { conversationId, userId, additionalSystemInstructions, maxTurns = 20 } = params

  const records: MessageRecord[] = await db.listMessagesByConversation(conversationId, userId, {
    limit: maxTurns,
  })

  // Format messages into standard LLM format
  const formattedMessages: StandardChatMessage[] = records.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const systemPrompt = additionalSystemInstructions
    ? `${DEFAULT_SYSTEM_PROMPT}\n\n${additionalSystemInstructions}`
    : DEFAULT_SYSTEM_PROMPT

  return {
    systemPrompt,
    messages: formattedMessages,
  }
}
