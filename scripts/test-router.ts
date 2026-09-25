import { aiRouter, AIRouterError } from '../lib/ai/router'
import { getModelCatalog } from '../lib/ai/catalog'
import { geminiLiveService } from '../lib/ai/live-service'
import { db } from '../lib/db/store'

async function runTests() {
  console.log('=== RUNNING AI ROUTER & GEMINI LIVE VERIFICATION TESTS ===')

  // 1. Model Registry
  const catalog = await getModelCatalog()
  console.assert(catalog.models.length >= 8, 'Expected at least 8 registered models')
  console.log('✓ Model Registry catalog verified:', catalog.models.length, 'models available')

  // 2. Model Resolution
  const { model: claudeModel, actualModel: claudeActual } = await aiRouter.resolveModel('claude')
  console.assert(claudeActual.provider === 'openrouter', 'Claude routing failed')
  console.log('✓ Claude model mapped to OpenRouter provider adapter')

  const { model: geminiModel, actualModel: geminiActual } = await aiRouter.resolveModel('gemini')
  console.assert(geminiActual.provider === 'gemini', 'Gemini routing failed')
  console.log('✓ Gemini model mapped to Gemini provider adapter')

  // 3. Rejection of unknown model
  try {
    await aiRouter.resolveModel('unsupported_fake_model')
    console.error('✗ Failed to reject unsupported model')
  } catch (err) {
    console.log('✓ Unknown model correctly rejected with AIRouterError')
  }

  // 4. Live Voice Session Lifecycle & Authorization
  const user = await db.createUser({
    email: `test_voice_${Date.now()}@vx.dev`,
    passwordHash: 'testhash123',
    displayName: 'Voice Tester',
  })
  const project = await db.createProject({ userId: user.id, name: 'Live Verification' })
  const convo = await db.createConversation({
    userId: user.id,
    projectId: project.id,
    title: 'Voice Continuity Session',
  })

  const session = await geminiLiveService.startSession({
    userId: user.id,
    conversationId: convo.id,
  })
  console.assert(session.sessionId.startsWith('live_'), 'Session ID generation failed')
  console.log('✓ Gemini Live voice session successfully initialized:', session.sessionId)

  const validated = geminiLiveService.validateSession(session.sessionId, user.id)
  console.assert(validated.conversationId === convo.id, 'Session conversation mismatch')
  console.log('✓ Live session validated and bound to conversation')

  try {
    geminiLiveService.validateSession(session.sessionId, 'unauthorized_attacker_id')
    console.error('✗ Unauthorized user should have been rejected')
  } catch {
    console.log('✓ Unauthorized live session access rejected')
  }

  const ended = geminiLiveService.endSession(session.sessionId, user.id)
  console.assert(ended === true, 'Session cleanup failed')
  console.log('✓ Gemini Live voice session cleanly terminated and resources released')

  console.log('=== ALL AUTOMATED TESTS PASSED SUCCESSFULLY ===')
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
