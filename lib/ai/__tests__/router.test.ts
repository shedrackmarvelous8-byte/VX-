import { aiRouter, AIRouterError, validateModelCapability } from '../router'
import { MODEL_REGISTRY, getPublicModelList } from '../models'
import { geminiLiveService } from '../live-service'
import { db } from '@/lib/db/store'

describe('AI Router & Model Registry', () => {
  test('Model Registry returns clean public models without secrets', () => {
    const publicModels = getPublicModelList()
    expect(publicModels.length).toBeGreaterThan(0)
    for (const m of publicModels) {
      expect(m.id).toBeDefined()
      expect(m.name).toBeDefined()
      expect(m.description).toBeDefined()
      // Ensure backend provider and targetModel are NOT leaked in public model list
      expect((m as unknown as { provider?: string }).provider).toBeUndefined()
      expect((m as unknown as { targetModel?: string }).targetModel).toBeUndefined()
    }
  })

  test('AIRouter resolves known models accurately', () => {
    const claude = aiRouter.resolveModel('claude')
    expect(claude.id).toBe('claude')
    expect(claude.provider).toBe('openrouter')

    const gemini = aiRouter.resolveModel('gemini')
    expect(gemini.id).toBe('gemini')
    expect(gemini.provider).toBe('gemini')
  })

  test('AIRouter rejects unknown or invalid models with AIRouterError', () => {
    expect(() => {
      aiRouter.resolveModel('unknown-model-xyz')
    }).toThrow(AIRouterError)
  })

  test('Model capability validator handles streaming, vision, tools properly', () => {
    const gemini = aiRouter.resolveModel('gemini')
    expect(validateModelCapability(gemini, 'streaming')).toBe(true)
    expect(validateModelCapability(gemini, 'vision')).toBe(true)
    expect(validateModelCapability(gemini, 'tools')).toBe(true)
  })
})

describe('Gemini Live Voice Service', () => {
  test('Live session lifecycle enforces user authorization and conversation validation', async () => {
    const user = await db.createProfile({ email: 'test_voice@vx.dev' })
    const project = await db.createProject({ userId: user.id, name: 'Voice Proj' })
    const convo = await db.createConversation({
      userId: user.id,
      projectId: project.id,
      title: 'Live Voice Test',
    })

    // Start Live session
    const session = await geminiLiveService.startSession({
      userId: user.id,
      conversationId: convo.id,
    })

    expect(session.sessionId).toBeDefined()
    expect(session.conversationId).toBe(convo.id)
    expect(session.userId).toBe(user.id)
    expect(session.model).toBe('gemini-3.8-live')

    // Validation
    const validated = geminiLiveService.validateSession(session.sessionId, user.id)
    expect(validated.sessionId).toBe(session.sessionId)

    // Unauthorized access rejection
    expect(() => {
      geminiLiveService.validateSession(session.sessionId, 'other-user-uuid')
    }).toThrow('Invalid or unauthorized live voice session')

    // End session
    const ended = geminiLiveService.endSession(session.sessionId, user.id)
    expect(ended).toBe(true)

    // Ensure session is cleaned up
    expect(() => {
      geminiLiveService.validateSession(session.sessionId, user.id)
    }).toThrow()
  })
})
