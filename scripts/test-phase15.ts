import fs from 'fs'
import path from 'path'
import { getMobileBootstrapFiles } from '../lib/mobile/bootstrap'

console.log('====================================================')
console.log('  PHASE 15 MOBILE APP BUILDER — EXPO / RN TEST SUITE  ')
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
// 1. Mobile Bootstrap Files Verification
// ----------------------------------------------------
console.log('\n--- 1. Mobile Bootstrap Files Verification ---')

const testProjectId = 'test-proj-mobile-123'
const testUserId = 'test-user-123'
const now = new Date().toISOString()

const mobileFiles = getMobileBootstrapFiles(testProjectId, testUserId, now)
assert(mobileFiles.length >= 4, 'Generates at least 4 core mobile bootstrap files')

const packageJsonFile = mobileFiles.find((f) => f.path === 'package.json')
assert(Boolean(packageJsonFile), 'Includes package.json')
const pkgData = JSON.parse(packageJsonFile?.content || '{}')
assert(pkgData.dependencies?.expo, 'package.json includes expo dependency')
assert(pkgData.dependencies?.['react-native'], 'package.json includes react-native dependency')

const appJsonFile = mobileFiles.find((f) => f.path === 'app.json')
assert(Boolean(appJsonFile), 'Includes app.json Expo config')
const appData = JSON.parse(appJsonFile?.content || '{}')
assert(appData.expo?.name === 'VX Mobile App', 'Expo config specifies app name')
assert(appData.expo?.android?.package === 'com.vx.mobileapp', 'Expo config specifies Android package ID')

const appTsxFile = mobileFiles.find((f) => f.path === 'App.tsx')
assert(Boolean(appTsxFile), 'Includes App.tsx React Native entry point')
assert(appTsxFile?.content.includes('SafeAreaView'), 'App.tsx uses React Native SafeAreaView')
assert(appTsxFile?.content.includes('StyleSheet'), 'App.tsx uses React Native StyleSheet')

const envExampleFile = mobileFiles.find((f) => f.path === '.env.example')
assert(Boolean(envExampleFile), 'Includes mobile .env.example')
assert(!envExampleFile?.content.includes('GEMINI_API_KEY'), 'Mobile .env.example contains NO backend secrets')
assert(!envExampleFile?.content.includes('SUPABASE_SECRET_KEY'), 'Mobile .env.example contains NO Supabase secret key')

console.log('====================================================')
console.log(`TEST SUMMARY: ${passes} PASSED, ${failures} FAILED`)
console.log('====================================================')

if (failures > 0) {
  process.exit(1)
}
