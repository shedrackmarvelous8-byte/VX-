import type { StandardChatMessage } from './context'

export interface OpenRouterGenerationResult {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not configured on the server')
  }
  return key
}

function formatMessagesForOpenRouter(systemPrompt: string, messages: StandardChatMessage[]) {
  const formatted: any[] = [{ role: 'system', content: systemPrompt }]
  for (const m of messages) {
    if (m.images && m.images.length > 0) {
      formatted.push({
        role: m.role,
        content: [
          { type: 'text', text: m.content || ' ' },
          ...m.images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          })),
        ],
      })
    } else {
      formatted.push({ role: m.role, content: m.content })
    }
  }
  return formatted
}

export async function generateOpenRouterResponse(params: {
  targetModel: string
  systemPrompt: string
  messages: StandardChatMessage[]
}): Promise<OpenRouterGenerationResult> {
  const apiKey = getOpenRouterApiKey()
  const formattedMessages = formatMessagesForOpenRouter(params.systemPrompt, params.messages)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vx.dev',
      'X-Title': 'VX Development Workspace',
    },
    body: JSON.stringify({
      model: params.targetModel,
      messages: formattedMessages,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const errorMsg =
      errorBody?.error?.message || `OpenRouter returned status code ${response.status}`
    throw new Error(errorMsg)
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content || ''
  const usage = data?.usage
    ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      }
    : undefined

  return { text, usage }
}

export async function streamOpenRouterResponse(params: {
  targetModel: string
  systemPrompt: string
  messages: StandardChatMessage[]
  onChunk: (chunk: string) => Promise<void> | void
}): Promise<OpenRouterGenerationResult> {
  const apiKey = getOpenRouterApiKey()
  const formattedMessages = formatMessagesForOpenRouter(params.systemPrompt, params.messages)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vx.dev',
      'X-Title': 'VX Development Workspace',
    },
    body: JSON.stringify({
      model: params.targetModel,
      messages: formattedMessages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const errorMsg =
      errorBody?.error?.message || `OpenRouter returned status code ${response.status}`
    throw new Error(errorMsg)
  }

  if (!response.body) {
    throw new Error('No response body received from OpenRouter')
  }

  let fullText = ''
  let finalUsage: OpenRouterGenerationResult['usage'] = undefined

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue

      const dataStr = trimmed.replace(/^data:\s*/, '')
      if (dataStr === '[DONE]') continue

      try {
        const parsed = JSON.parse(dataStr)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          await params.onChunk(delta)
        }

        if (parsed.usage) {
          finalUsage = {
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  return { text: fullText, usage: finalUsage }
}
