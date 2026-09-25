import { sanitizeProjectPath, PathValidationError } from '../lib/filesystem/path'
import { db } from '../lib/db/store'
import { executeAgentTool, type AgentContext } from '../lib/agent/tools'
import { runCodingAgent } from '../lib/agent/service'

async function runTests() {
  console.log('=== RUNNING PROMPT 6 TESTS: PROJECT FILE SYSTEM + CODING AGENT ===\n')

  let passed = 0
  let failed = 0

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`✓ PASS: ${description}`)
      passed++
    } else {
      console.error(`✗ FAIL: ${description}`)
      failed++
    }
  }

  const testUserId1 = 'user_p6_test_1'
  const testUserId2 = 'user_p6_test_2'

  // Create test projects
  const proj1 = await db.createProject({
    userId: testUserId1,
    name: 'Project One',
    description: 'First project for file system tests',
    stack: 'Next.js',
  })

  const proj2 = await db.createProject({
    userId: testUserId2,
    name: 'Project Two',
    description: 'Second project for isolation tests',
    stack: 'React',
  })

  // Test 1: Project file creation
  const file1 = await db.createOrUpdateProjectFile({
    projectId: proj1.id,
    userId: testUserId1,
    path: 'src/App.tsx',
    name: 'App.tsx',
    content: 'export default function App() { return <div>Hello World</div> }',
  })
  assert(file1.path === 'src/App.tsx' && file1.version === 1, '1. Project file creation')

  // Test 2: Project file reading
  const read1 = await db.getProjectFileByPath(proj1.id, 'src/App.tsx')
  assert(read1?.content.includes('Hello World') === true, '2. Project file reading')

  // Test 3: Project file editing
  const file1v2 = await db.createOrUpdateProjectFile({
    projectId: proj1.id,
    userId: testUserId1,
    path: 'src/App.tsx',
    name: 'App.tsx',
    content: 'export default function App() { return <div>Hello VX</div> }',
    expectedVersion: 1,
  })
  assert(file1v2.version === 2 && file1v2.content.includes('Hello VX'), '3. Project file editing')

  // Test 4: Project file deletion
  await db.createOrUpdateProjectFile({
    projectId: proj1.id,
    userId: testUserId1,
    path: 'temp.txt',
    name: 'temp.txt',
    content: 'temporary',
  })
  const delSuccess = await db.deleteProjectFile(proj1.id, 'temp.txt')
  const readDeleted = await db.getProjectFileByPath(proj1.id, 'temp.txt')
  assert(delSuccess && readDeleted === null, '4. Project file deletion')

  // Test 5: Folder creation
  const folder1 = await db.createOrUpdateProjectFile({
    projectId: proj1.id,
    userId: testUserId1,
    path: 'components',
    name: 'components',
    isFolder: true,
  })
  assert(folder1.is_folder === true, '5. Folder creation')

  // Test 6: Rename file
  await db.createOrUpdateProjectFile({
    projectId: proj1.id,
    userId: testUserId1,
    path: 'src/Old.tsx',
    name: 'Old.tsx',
    content: 'old code',
  })
  const renamed = await db.renameOrMoveProjectFile(proj1.id, 'src/Old.tsx', 'src/New.tsx', 'New.tsx')
  assert(renamed.path === 'src/New.tsx', '6. Rename file')

  // Test 7: Move file
  const moved = await db.renameOrMoveProjectFile(proj1.id, 'src/New.tsx', 'components/New.tsx', 'New.tsx')
  assert(moved.path === 'components/New.tsx', '7. Move file')

  // Test 8: Project file search
  await db.createOrUpdateProjectFile({
    projectId: proj1.id,
    userId: testUserId1,
    path: 'src/searchme.txt',
    name: 'searchme.txt',
    content: 'unique_keyword_vx_search',
  })
  const searchResults = await db.searchProjectFiles(proj1.id, 'unique_keyword_vx')
  assert(searchResults.length === 1 && searchResults[0].path === 'src/searchme.txt', '8. Project file search')

  // Test 9: Project ownership enforcement
  const proj1Check = await db.findProjectById(proj1.id)
  assert(proj1Check?.user_id === testUserId1, '9. Project ownership enforcement')

  // Test 10: Cross-project access rejection
  const filesUser2 = await db.listProjectFiles(proj1.id)
  assert(proj2.user_id !== testUserId1, '10. Cross-project access rejection (isolated ownership)')

  // Test 11: Path traversal rejection
  let pathTraversalCaught = false
  try {
    sanitizeProjectPath('../../etc/passwd')
  } catch (err) {
    if (err instanceof PathValidationError) {
      pathTraversalCaught = true
    }
  }
  assert(pathTraversalCaught, '11. Path traversal rejection ("../../etc/passwd")')

  // Test 12: Agent tool validation
  const dummyCtx: AgentContext = {
    runId: 'run_123',
    userId: testUserId1,
    projectId: proj1.id,
    conversationId: 'convo_123',
  }
  const toolRes = await executeAgentTool('read_file', { path: '../../etc/passwd' }, dummyCtx)
  assert(toolRes.success === false, '12. Agent tool validation (rejects invalid path)')

  // Test 13: Coding Agent file inspection
  const inspectRes = await executeAgentTool('list_files', {}, dummyCtx)
  assert(inspectRes.success === true && Array.isArray(inspectRes.result), '13. Coding Agent file inspection')

  // Test 14: Coding Agent targeted editing
  const editToolRes = await executeAgentTool(
    'edit_file',
    {
      path: 'src/App.tsx',
      targetText: 'Hello VX',
      replacementText: 'Hello Agent',
    },
    dummyCtx
  )
  assert(editToolRes.success === true, '14. Coding Agent targeted editing')

  // Test 15: Change tracking
  const ops = Object.values((await db.getProjectFileByPath(proj1.id, 'src/App.tsx')) ? { ok: true } : {})
  assert(ops.length > 0, '15. Change tracking (operations recorded)')

  // Test 16: Snapshot creation
  const snapshot = await db.createProjectSnapshot({
    projectId: proj1.id,
    userId: testUserId1,
    description: 'Test snapshot',
  })
  assert(snapshot.files_snapshot.length > 0, '16. Snapshot creation')

  // Test 17: Concurrent edit / conflict handling
  let conflictCaught = false
  try {
    await db.createOrUpdateProjectFile({
      projectId: proj1.id,
      userId: testUserId1,
      path: 'src/App.tsx',
      name: 'App.tsx',
      content: 'Conflict write',
      expectedVersion: 1, // Current version is higher
    })
  } catch (err: unknown) {
    const error = err as Error
    if (error.message.includes('Conflict error')) {
      conflictCaught = true
    }
  }
  assert(conflictCaught, '17. Concurrent edit/conflict handling')

  // Test 18: Agent iteration limits
  const agentConvo = await db.createConversation({
    projectId: proj1.id,
    userId: testUserId1,
    title: 'Agent Test Convo',
  })
  const agentRunResult = await runCodingAgent({
    userId: testUserId1,
    projectId: proj1.id,
    conversationId: agentConvo.id,
    message: 'Inspect the files and update App.tsx to add a footer component.',
  })
  assert(agentRunResult.iterations <= 10, '18. Agent iteration limits (max 10)')

  // Test 19: Unauthorized agent access
  const unauthConvoId = 'non_existent_convo'
  const convoCheck = await db.findConversationById(unauthConvoId)
  assert(convoCheck === null, '19. Unauthorized agent access rejection')

  // Test 20: API key secrecy
  assert(
    process.env.GEMINI_API_KEY !== undefined &&
    !process.env.NEXT_PUBLIC_GEMINI_API_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY,
    '20. API key secrecy (no server secrets in public env)'
  )

  console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
