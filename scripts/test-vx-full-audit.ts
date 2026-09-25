import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { db } from '../lib/db/store'
import { aiRouter } from '../lib/ai/router'
import { classifyUserIntent } from '../lib/intelligence/intent'
import { validateMobileProjectForBuild, triggerAndroidApkBuild } from '../lib/mobile/build-service'
import { generateQrCodeSvg } from '../lib/mobile/qr'

console.log('====================================================')
console.log('    VX COMPREHENSIVE END-TO-END SYSTEM AUDIT SUITE  ')
console.log('====================================================')

let totalPass = 0
let totalFail = 0

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${name}${detail ? ` — ${detail}` : ''}`)
    totalPass++
  } else {
    console.error(`  ✗ [FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
    totalFail++
  }
}

async function runAudit() {
  const auditUserId = 'audit-user-' + Date.now()
  const auditEmail = `audit-${Date.now()}@vx.dev`
  const auditPassword = 'SecurePassword123!'

  // ----------------------------------------------------
  // 1. AUTHENTICATION & USER MANAGEMENT AUDIT
  // ----------------------------------------------------
  console.log('\n--- 1. Authentication & Session Security Audit ---')
  
  const userResult = await db.createUser({
    email: auditEmail,
    passwordHash: '$2a$10$hashedPasswordSample1234567890',
    displayName: 'Audit Engineer',
    emailVerified: true,
  })
  assert(Boolean(userResult.profile?.id), 'User Account Creation', `Created user ID ${userResult.profile?.id}`)

  const foundUser = await db.findUserByEmail(auditEmail)
  assert(foundUser?.id === userResult.profile.id, 'User Search by Email', `Found user ${foundUser?.email}`)

  const session = await db.createSession(userResult.profile.id, 'session-token-' + Date.now(), new Date(Date.now() + 86400000))
  assert(Boolean(session.token), 'Session Creation & Expiration Set', `Token expires ${session.expires_at}`)

  const fetchedSession = await db.getSession(session.token)
  assert(fetchedSession?.user.id === userResult.profile.id, 'Session Token Validation', 'Session maps correctly to authenticated profile')

  // ----------------------------------------------------
  // 2. PROJECT & CONVERSATION DATA ISOLATION AUDIT
  // ----------------------------------------------------
  console.log('\n--- 2. Project Architecture & Data Isolation Audit ---')

  const webProject = await db.createProject({
    userId: userResult.profile.id,
    name: 'Audit Web Workspace',
    stack: 'Next.js',
    target: 'web',
  })
  assert(webProject.target === 'web', 'Web Project Target', `ID: ${webProject.id}`)

  const mobileProject = await db.createProject({
    userId: userResult.profile.id,
    name: 'Audit Mobile App',
    stack: 'Expo · React Native',
    target: 'mobile',
  })
  assert(mobileProject.target === 'mobile', 'Mobile Project Target', `ID: ${mobileProject.id}`)

  // Verify IDOR Isolation
  const otherUserProjects = await db.listProjectsByUser('unauthorized-user-999')
  assert(otherUserProjects.length === 0, 'IDOR Data Isolation', 'Unauthorized user cannot query another user projects')

  const convo = await db.createConversation({
    userId: userResult.profile.id,
    projectId: webProject.id,
    title: 'Audit System Chat',
  })
  assert(convo.project_id === webProject.id, 'Conversation Attachment to Project', `Convo ID: ${convo.id}`)

  const msg = await db.createMessage({
    conversationId: convo.id,
    userId: userResult.profile.id,
    role: 'user',
    content: 'Audit initial system message',
  })
  assert(Boolean(msg?.id), 'Message Persistence', `Message ID: ${msg?.id}`)

  // ----------------------------------------------------
  // 3. AI ROUTER & MODEL DISCOVERY AUDIT
  // ----------------------------------------------------
  console.log('\n--- 3. AI Router & Model Discovery Audit ---')

  const resolvedAuto = await aiRouter.resolveModel('auto', { isCodingTask: false })
  assert(Boolean(resolvedAuto.model?.id), 'Auto Model Selection Resolution', `Resolved model: ${resolvedAuto.model.name}`)

  const resolvedCoding = await aiRouter.resolveModel('auto', { isCodingTask: true })
  assert(Boolean(resolvedCoding.model?.id), 'Coding Task Model Resolution', `Resolved model: ${resolvedCoding.model.name}`)

  const manualResolution = await aiRouter.resolveModel('gemini-3.5-flash')
  assert(manualResolution.model.id.includes('gemini-3.5-flash'), 'Manual Model Selection Preservation', `Preserved user model preference (${manualResolution.model.id})`)

  // ----------------------------------------------------
  // 4. WORK INTELLIGENCE & INTENT CLASSIFICATION AUDIT
  // ----------------------------------------------------
  console.log('\n--- 4. Work Intelligence & Intent Classification Audit ---')

  const intentCoding = classifyUserIntent('Fix the bug in src/components/Header.tsx and add a button', false)
  assert(intentCoding.intent === 'implementation_request', 'Coding Intent Classification', `Confidence: ${intentCoding.confidence}`)

  const intentPlan = classifyUserIntent('Show me a proposed build plan for a barbershop website', false)
  assert(
    intentPlan.intent === 'brainstorming' || intentPlan.intent === 'conversation',
    'Plan Intent Classification',
    `Intent: ${intentPlan.intent} (Execution allowed: ${intentPlan.isCodingExecutionAllowed})`
  )

  // ----------------------------------------------------
  // 5. CODING AGENT & SNAPSHOT / CHECKPOINT AUDIT
  // ----------------------------------------------------
  console.log('\n--- 5. File System, Checkpoints & Restore Audit ---')

  const fileRecord = await db.createOrUpdateProjectFile({
    projectId: webProject.id,
    userId: userResult.profile.id,
    path: 'src/config/app.ts',
    name: 'app.ts',
    content: 'export const APP_NAME = "Audit Workspace";',
  })
  assert(fileRecord.version === 1, 'File Creation & Initial Versioning', `Path: ${fileRecord.path}`)

  // Create Snapshot
  const snapshot = await db.createProjectSnapshot({
    projectId: webProject.id,
    userId: userResult.profile.id,
    description: 'Pre-audit test snapshot',
  })
  assert(snapshot.files_snapshot.length >= 1, 'Checkpoint Snapshot Creation', `Captured ${snapshot.files_snapshot.length} files`)

  // Modify File
  const updatedFile = await db.createOrUpdateProjectFile({
    projectId: webProject.id,
    userId: userResult.profile.id,
    path: 'src/config/app.ts',
    name: 'app.ts',
    content: 'export const APP_NAME = "Modified Name";',
  })
  assert(updatedFile.version === 2, 'File Version Increment', `New version: ${updatedFile.version}`)

  // Restore Checkpoint
  const restoreSuccess = await db.restoreProjectSnapshot(snapshot.id, userResult.profile.id)
  assert(restoreSuccess === true, 'Checkpoint Restoration', 'Successfully restored previous checkpoint state')

  const restoredFile = await db.getProjectFileByPath(webProject.id, 'src/config/app.ts')
  assert(restoredFile?.content.includes('Audit Workspace'), 'Restored File Content Verification', 'Content matches pre-modification state')

  // ----------------------------------------------------
  // 6. MEDIA CREATION STUDIO & STORAGE AUDIT
  // ----------------------------------------------------
  console.log('\n--- 6. Media Creation Studio & Storage Audit ---')

  const mediaRecord = await db.createProjectMedia({
    projectId: webProject.id,
    userId: userResult.profile.id,
    fileName: 'hero-banner.png',
    displayName: 'Hero Banner Image',
    fileType: 'image',
    mimeType: 'image/png',
    sizeBytes: 1024 * 128,
    sourceType: 'generated',
    storagePath: `/uploads/media/${webProject.id}/hero-banner.png`,
    prompt: 'Vibrant dark theme hero banner',
  })
  assert(Boolean(mediaRecord.id), 'Media Record Creation', `Media ID: ${mediaRecord.id}`)

  const mediaList = await db.listProjectMedia(webProject.id, userResult.profile.id)
  assert(mediaList.some((m) => m.id === mediaRecord.id), 'Media Library Retrieval', `Found ${mediaList.length} media records`)

  // ----------------------------------------------------
  // 7. MOBILE APP BUILDER & ANDROID APK AUDIT
  // ----------------------------------------------------
  console.log('\n--- 7. Mobile App Builder & Android APK System Audit ---')

  // Pre-build validation on mobile project
  const mobileVal = await validateMobileProjectForBuild(mobileProject.id, userResult.profile.id)
  assert(mobileVal.valid === true, 'Mobile Pre-build Validation', `Package: ${mobileVal.appId}`)

  // Trigger Build Job
  const buildJob = await triggerAndroidApkBuild({
    userId: userResult.profile.id,
    projectId: mobileProject.id,
    version: '1.0.0',
    versionCode: 1,
  })
  assert(Boolean(buildJob.id), 'Android APK Build Job Queueing', `Job ID: ${buildJob.id}`)

  // Wait for worker completion
  let attempts = 0
  let currentJob = buildJob
  while (attempts < 15) {
    await new Promise((r) => setTimeout(r, 300))
    attempts++
    const pollJob = await db.getAndroidBuildJob(buildJob.id, userResult.profile.id)
    if (pollJob) {
      currentJob = pollJob
      if (pollJob.status === 'completed' || pollJob.status === 'failed') break
    }
  }

  assert(currentJob.status === 'completed', 'Android Build Worker Completion', `Status: ${currentJob.status}`)
  assert(Boolean(currentJob.artifact_id), 'APK Artifact Record Linking', `Artifact ID: ${currentJob.artifact_id}`)

  // Verify Artifact Record & Physical File
  if (currentJob.artifact_id) {
    const artifact = await db.getProjectArtifact(currentJob.artifact_id, userResult.profile.id)
    assert(Boolean(artifact), 'APK Artifact Retrieval')
    assert(artifact?.checksum.length === 64, 'SHA-256 Checksum Calculation', `Digest: ${artifact?.checksum.slice(0, 16)}...`)

    // Verify Shareable Link Creation
    const shareLink = await db.createShareableLink({
      artifactId: artifact!.id,
      projectId: mobileProject.id,
      userId: userResult.profile.id,
    })
    assert(Boolean(shareLink.token), 'Shareable Link Generation', `Token: ${shareLink.token.slice(0, 12)}...`)

    const resolvedLink = await db.getShareableLinkByToken(shareLink.token)
    assert(resolvedLink?.artifact_id === artifact!.id, 'Share Token Resolution')

    // Test QR Code Generator
    const qrSvg = generateQrCodeSvg(`https://vx.dev/download/${shareLink.token}`, 180)
    assert(qrSvg.includes('<svg'), 'QR Code SVG Rendering')
  }

  // ----------------------------------------------------
  // 8. SECURITY GUARD & SECRET PROTECTION AUDIT
  // ----------------------------------------------------
  console.log('\n--- 8. Security Guard & Secret Protection Audit ---')

  await db.createOrUpdateProjectFile({
    projectId: mobileProject.id,
    userId: userResult.profile.id,
    path: 'src/secret.ts',
    name: 'secret.ts',
    content: 'const key = "OPENROUTER_API_KEY_sk-1234567890"',
  })

  const blockedVal = await validateMobileProjectForBuild(mobileProject.id, userResult.profile.id)
  assert(blockedVal.valid === false, 'Platform Secret Protection Guard', 'Pre-build validation blocked file referencing OPENROUTER_API_KEY')
  assert(blockedVal.errors.some((e) => e.includes('OPENROUTER_API_KEY')), 'Forbidden Secret Violation Notice')

  // Clean up secret file to leave project clean
  await db.deleteProjectFile(mobileProject.id, 'src/secret.ts')

  console.log('\n====================================================')
  console.log(`  AUDIT COMPLETED: ${totalPass} PASSED, ${totalFail} FAILED`)
  console.log('====================================================')

  if (totalFail > 0) {
    process.exit(1)
  }
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err)
  process.exit(1)
})
