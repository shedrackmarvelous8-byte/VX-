import fs from 'fs'
import path from 'path'
import { isPrivateOrReservedIp, validateSafeExternalUrl } from '../lib/security/ssrf'
import { isValidEnvKey, isValidProjectId, sanitizeFilename, validateSafeFilePath } from '../lib/security/validation'
import { redactSecrets } from '../lib/security/redact'
import { checkRateLimit } from '../lib/security/rate-limit'
import { validateProductionConfig } from '../lib/security/config-validator'

console.log('====================================================')
console.log('  PHASE 13 SECURITY & PWA COMPREHENSIVE TEST SUITE  ')
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

// ----------------------------------------------------
// 1. PWA & Asset Verification
// ----------------------------------------------------
console.log('\n--- 1. PWA & Asset Verification ---')

const publicDir = path.join(process.cwd(), 'public')
assert(fs.existsSync(path.join(publicDir, 'sw.js')), 'Service worker (sw.js) exists in public/')
assert(fs.existsSync(path.join(publicDir, 'manifest.json')), 'Manifest (manifest.json) exists in public/')
assert(fs.existsSync(path.join(publicDir, 'icon.svg')), 'Brand SVG icon exists in public/')
assert(fs.existsSync(path.join(publicDir, 'icon-192.png')), '192x192 PNG icon exists in public/')
assert(fs.existsSync(path.join(publicDir, 'icon-512.png')), '512x512 PNG icon exists in public/')
assert(fs.existsSync(path.join(publicDir, 'icon-maskable.png')), 'Maskable 512x512 PNG icon exists in public/')
assert(fs.existsSync(path.join(publicDir, 'apple-touch-icon.png')), 'iOS Apple touch icon exists in public/')

const manifestContent = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'))
assert(manifestContent.display === 'standalone', 'Manifest display mode is standalone')
assert(manifestContent.start_url === '/', 'Manifest start_url is /')
assert(manifestContent.name === 'VX', 'Manifest name is VX')
assert(manifestContent.icons.length >= 3, 'Manifest defines >= 3 icons')

const swContent = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8')
assert(swContent.includes('isBypassUrl'), 'Service worker includes explicit API bypass logic')
assert(swContent.includes('/api/'), 'Service worker bypasses /api/* from static caching')

// ----------------------------------------------------
// 2. SSRF Protection Tests
// ----------------------------------------------------
console.log('\n--- 2. SSRF Protection Tests ---')

assert(isPrivateOrReservedIp('127.0.0.1') === true, 'Blocks 127.0.0.1 loopback')
assert(isPrivateOrReservedIp('10.0.1.5') === true, 'Blocks 10.0.0.0/8 private network')
assert(isPrivateOrReservedIp('192.168.1.1') === true, 'Blocks 192.168.0.0/16 private network')
assert(isPrivateOrReservedIp('172.16.5.4') === true, 'Blocks 172.16.0.0/12 private network')
assert(isPrivateOrReservedIp('169.254.169.254') === true, 'Blocks AWS/GCP cloud metadata IP')
assert(isPrivateOrReservedIp('8.8.8.8') === false, 'Allows public IP 8.8.8.8')

assert(validateSafeExternalUrl('http://127.0.0.1:8080/admin').valid === false, 'Rejects localhost fetch URL')
assert(validateSafeExternalUrl('https://metadata.google.internal/computeMetadata').valid === false, 'Rejects GCP internal metadata URL')
assert(validateSafeExternalUrl('https://api.github.com/repos/test/repo').valid === true, 'Allows valid public HTTPS URL')

// ----------------------------------------------------
// 3. File & Path Validation Tests
// ----------------------------------------------------
console.log('\n--- 3. File & Path Validation Tests ---')

assert(validateSafeFilePath('../../etc/passwd') === null, 'Blocks ../../ directory traversal')
assert(validateSafeFilePath('src/app/page.tsx') === 'src/app/page.tsx', 'Accepts valid relative file path')
assert(validateSafeFilePath('uploads/test\0file.js') === null, 'Blocks null-byte injection')

assert(isValidProjectId('proj-123_abc') === true, 'Accepts valid project ID')
assert(isValidProjectId('proj/../../evil') === false, 'Rejects malicious project ID')

assert(isValidEnvKey('DATABASE_URL') === true, 'Accepts standard POSIX env key')
assert(isValidEnvKey('123_BAD-KEY') === false, 'Rejects invalid env key format')

assert(sanitizeFilename('my cool file.png') === 'my_cool_file.png', 'Sanitizes filename with spaces')
assert(sanitizeFilename('../../../evil.exe') === 'evil.exe', 'Strips directory traversal from upload filename')

// ----------------------------------------------------
// 4. Secret Redaction Tests
// ----------------------------------------------------
console.log('\n--- 4. Secret Redaction Tests ---')

const sampleText = 'Error connecting with key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6 and vercel_1234567890abcdef1234'
const redacted = redactSecrets(sampleText)
assert(!redacted.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'), 'Redacts Gemini API keys')
assert(redacted.includes('[REDACTED_GEMINI_KEY]'), 'Inserts Gemini redaction placeholder')
assert(!redacted.includes('vercel_1234567890abcdef1234'), 'Redacts Vercel tokens')

// ----------------------------------------------------
// 5. Rate Limiter Tests
// ----------------------------------------------------
console.log('\n--- 5. Rate Limiter Tests ---')

const testKey = `test-ip-${Date.now()}`
const customConfig = { maxRequests: 3, windowSeconds: 2 }

assert(checkRateLimit(testKey, customConfig).allowed === true, 'Attempt 1 allowed')
assert(checkRateLimit(testKey, customConfig).allowed === true, 'Attempt 2 allowed')
assert(checkRateLimit(testKey, customConfig).allowed === true, 'Attempt 3 allowed')
assert(checkRateLimit(testKey, customConfig).allowed === false, 'Attempt 4 blocked by rate limit')

// ----------------------------------------------------
// 6. Production Config Validator Tests
// ----------------------------------------------------
console.log('\n--- 6. Production Config Validator Tests ---')

const configResult = validateProductionConfig()
assert(Array.isArray(configResult.items), 'Returns configuration items checklist')
assert(typeof configResult.valid === 'boolean', 'Returns overall validation boolean')

console.log('====================================================')
console.log(`TEST SUMMARY: ${passes} PASSED, ${failures} FAILED`)
console.log('====================================================')

if (failures > 0) {
  process.exit(1)
}
