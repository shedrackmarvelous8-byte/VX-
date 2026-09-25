import fs from 'fs'
import path from 'path'
import { triggerAndroidApkBuild, validateMobileProjectForBuild } from '../lib/mobile/build-service'
import { generateQrCodeSvg } from '../lib/mobile/qr'
import { db } from '../lib/db/store'

console.log('====================================================')
console.log('  PHASE 16 ANDROID APK & SECURE DOWNLOAD TEST SUITE ')
console.log('====================================================')

let passes = 0
let failures = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`)
    passes++
  } else {
    console.error(`  ✗ [FAIL] ${message}`)
    failures++
  }
}

async function runTests() {
  const testUserId = 'test-user-p16-' + Date.now()

  // 1. Create a Mobile Project in DB
  const project = await db.createProject({
    userId: testUserId,
    name: 'Phase 16 Test App',
    description: 'Android APK build test project',
    stack: 'Expo · React Native',
    target: 'mobile',
  })

  assert(Boolean(project.id), 'Successfully created mobile project')
  assert(project.target === 'mobile', 'Project target is mobile')

  // 2. Run Pre-build Validation
  const validation = await validateMobileProjectForBuild(project.id, testUserId)
  assert(validation.valid === true, 'Pre-build validation passes for bootstrapped mobile project')
  assert(validation.appName === 'VX Mobile App', 'Resolves app name from app.json')
  assert(validation.appId === 'com.vx.mobileapp', 'Resolves Android application ID')

  // 3. Trigger Android APK Build Job
  const job = await triggerAndroidApkBuild({
    userId: testUserId,
    projectId: project.id,
    version: '1.0.0',
    versionCode: 1,
  })

  assert(Boolean(job.id), 'Build job queued successfully')
  assert(job.status === 'queued', 'Initial job status is queued')

  // Wait for worker to complete async background processing
  console.log('Waiting for background Android build worker to complete...')
  let pollAttempts = 0
  let finalJob = job

  while (pollAttempts < 15) {
    await new Promise((r) => setTimeout(r, 400))
    pollAttempts++
    const fetched = await db.getAndroidBuildJob(job.id, testUserId)
    if (fetched) {
      finalJob = fetched
      if (fetched.status === 'completed' || fetched.status === 'failed') {
        break
      }
    }
  }

  assert(finalJob.status === 'completed', 'Build job completed successfully')
  assert(Boolean(finalJob.artifact_id), 'Job has associated artifact_id')
  assert(finalJob.logs.length >= 4, 'Job logged build progress phases')

  // 4. Verify Project Artifact
  const artifactId = finalJob.artifact_id as string
  const artifact = await db.getProjectArtifact(artifactId, testUserId)
  assert(Boolean(artifact), 'Artifact record retrieved from database')
  assert(artifact?.mime_type === 'application/vnd.android.package-archive', 'Artifact MIME type is application/vnd.android.package-archive')
  assert(Boolean(artifact?.checksum && artifact.checksum.length === 64), 'Artifact has 64-char SHA-256 checksum')

  // Verify physical file on disk
  const relPath = artifact?.storage_path.startsWith('/') ? artifact.storage_path.slice(1) : artifact?.storage_path || ''
  const absPath = path.join(process.cwd(), 'public', relPath)
  assert(fs.existsSync(absPath), 'Generated APK binary file exists on disk storage')
  assert(fs.statSync(absPath).size > 1000, 'APK file size is greater than 1KB')

  // 5. Verify Shareable Link Creation & Resolution
  const shareLink = await db.createShareableLink({
    artifactId,
    projectId: project.id,
    userId: testUserId,
  })

  assert(Boolean(shareLink.token), 'Generated secure random share token')

  const resolvedLink = await db.getShareableLinkByToken(shareLink.token)
  assert(Boolean(resolvedLink), 'Successfully resolved shareable link by token')
  assert(resolvedLink?.artifact_id === artifactId, 'Shareable link points to correct artifact')

  // 6. Test Link Revocation
  const revoked = await db.revokeShareableLink(shareLink.id, testUserId)
  assert(revoked === true, 'Revoked shareable link')
  const resolvedRevoked = await db.getShareableLinkByToken(shareLink.token)
  assert(resolvedRevoked === null, 'Revoked link cannot be resolved anymore')

  // 7. Test QR Code Generator
  const qrSvg = generateQrCodeSvg('https://vx.dev/download/sample-token', 180)
  assert(qrSvg.includes('<svg') && qrSvg.includes('rect'), 'Generates valid SVG QR code')

  // 8. Test Secret Protection Guard
  await db.createOrUpdateProjectFile({
    projectId: project.id,
    userId: testUserId,
    path: 'src/config.ts',
    name: 'config.ts',
    content: 'const key = "GEMINI_API_KEY_AIzaSy12345"',
  })

  const failedVal = await validateMobileProjectForBuild(project.id, testUserId)
  assert(failedVal.valid === false, 'Pre-build validation blocks project with forbidden client secrets')
  assert(failedVal.errors.some((e) => e.includes('GEMINI_API_KEY')), 'Error specifies forbidden secret detected')

  console.log('====================================================')
  console.log(`TEST SUMMARY: ${passes} PASSED, ${failures} FAILED`)
  console.log('====================================================')

  if (failures > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
