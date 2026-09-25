import { checkMicrophoneSupportAndState, stopMediaStream } from '../lib/voice/permissions'

console.log('====================================================')
console.log('    VX MICROPHONE & VOICE PERMISSION FIX SUITE     ')
console.log('====================================================')

let passes = 0
let failures = 0

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${name}${detail ? ` — ${detail}` : ''}`)
    passes++
  } else {
    console.error(`  ✗ [FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
    failures++
  }
}

async function runVoiceTests() {
  console.log('\n--- 1. Secure Context & MediaDevices API Support ---')
  const diag = await checkMicrophoneSupportAndState()

  // In Node.js environment window/navigator may be undefined or simulated
  assert(typeof diag.isSecureContext === 'boolean', 'Secure Context Flag Evaluation', `isSecureContext: ${diag.isSecureContext}`)
  assert(typeof diag.isMediaDevicesSupported === 'boolean', 'MediaDevices Support Evaluation', `isMediaDevicesSupported: ${diag.isMediaDevicesSupported}`)
  assert(Boolean(diag.permissionState), 'Permission State Classification', `permissionState: ${diag.permissionState}`)

  console.log('\n--- 2. Stream Stop Cleanup Safeguards ---')
  let tracksStopped = false
  const mockTrack = {
    stop: () => {
      tracksStopped = true
    },
  } as unknown as MediaStreamTrack

  const mockStream = {
    getTracks: () => [mockTrack],
  } as unknown as MediaStream

  stopMediaStream(mockStream)
  assert(tracksStopped === true, 'stopMediaStream stops all active tracks cleanly')

  // Test null safety
  stopMediaStream(null)
  assert(true, 'stopMediaStream handles null/undefined streams safely')

  console.log('====================================================')
  console.log(`TEST SUMMARY: ${passes} PASSED, ${failures} FAILED`)
  console.log('====================================================')

  if (failures > 0) {
    process.exit(1)
  }
}

runVoiceTests().catch((err) => {
  console.error('Voice test runner error:', err)
  process.exit(1)
})
