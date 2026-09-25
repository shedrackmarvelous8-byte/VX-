import { getSupabaseAdminClient } from './supabase'
import { getMobileBootstrapFiles } from '../mobile/bootstrap'
import type {
  AgentOperation,
  AgentRun,
  AiUsageLog,
  AndroidBuildJob,
  AuthCredential,
  AuthResetToken,
  AuthSession,
  AuthVerificationCode,
  ConversationRecord,
  DocumentAnalysisRecord,
  GenerationJob,
  MessageRecord,
  NoteCategory,
  ProjectArtifact,
  ProjectContextMemory,
  ProjectFile,
  ProjectFileVersion,
  ProjectMedia,
  ProjectNote,
  ProjectRecord,
  ProjectReview,
  ProjectSnapshot,
  ShareableLink,
  UserProfile,
} from './types'
import { generateUuid } from '../auth/tokens'
import fs from 'fs'
import path from 'path'

// Persistence file location for standalone / fallback mode
const DATA_DIR = path.join(process.cwd(), '.data')
const DB_FILE = path.join(DATA_DIR, 'vx_database.json')

interface DatabaseDump {
  profiles: Record<string, UserProfile>
  credentials: Record<string, AuthCredential>
  sessions: Record<string, AuthSession>
  resetTokens: Record<string, AuthResetToken>
  verificationCodes: Record<string, AuthVerificationCode>
  projects: Record<string, ProjectRecord>
  conversations: Record<string, ConversationRecord>
  messages: Record<string, MessageRecord>
  aiUsageLogs: Record<string, AiUsageLog>
  projectFiles: Record<string, ProjectFile>
  projectFileVersions: Record<string, ProjectFileVersion>
  projectSnapshots: Record<string, ProjectSnapshot>
  agentRuns: Record<string, AgentRun>
  agentOperations: Record<string, AgentOperation>
  notes?: Record<string, ProjectNote>
  reviews?: Record<string, ProjectReview>
  documents?: Record<string, DocumentAnalysisRecord>
  contextMemories?: Record<string, ProjectContextMemory>
  media?: Record<string, ProjectMedia>
  generationJobs?: Record<string, GenerationJob>
  buildJobs?: Record<string, AndroidBuildJob>
  artifacts?: Record<string, ProjectArtifact>
  shareableLinks?: Record<string, ShareableLink>
}

// In-memory cache synced with disk persistence
let memoryStore: DatabaseDump | null = null

function ensurePersistenceDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
  } catch {
    // Ignore in read-only environment
  }
}

function loadDatabase(): DatabaseDump {
  if (memoryStore) return memoryStore

  ensurePersistenceDir()
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8')
      memoryStore = JSON.parse(content)
      if (!memoryStore) memoryStore = {} as DatabaseDump
      if (!memoryStore.profiles) memoryStore.profiles = {}
      if (!memoryStore.credentials) memoryStore.credentials = {}
      if (!memoryStore.sessions) memoryStore.sessions = {}
      if (!memoryStore.resetTokens) memoryStore.resetTokens = {}
      if (!memoryStore.verificationCodes) memoryStore.verificationCodes = {}
      if (!memoryStore.projects) memoryStore.projects = {}
      if (!memoryStore.conversations) memoryStore.conversations = {}
      if (!memoryStore.messages) memoryStore.messages = {}
      if (!memoryStore.aiUsageLogs) memoryStore.aiUsageLogs = {}
      if (!memoryStore.projectFiles) memoryStore.projectFiles = {}
      if (!memoryStore.projectFileVersions) memoryStore.projectFileVersions = {}
      if (!memoryStore.projectSnapshots) memoryStore.projectSnapshots = {}
      if (!memoryStore.agentRuns) memoryStore.agentRuns = {}
      if (!memoryStore.agentOperations) memoryStore.agentOperations = {}
      if (!memoryStore.notes) memoryStore.notes = {}
      if (!memoryStore.reviews) memoryStore.reviews = {}
      if (!memoryStore.documents) memoryStore.documents = {}
      if (!memoryStore.contextMemories) memoryStore.contextMemories = {}
      if (!memoryStore.media) memoryStore.media = {}
      if (!memoryStore.generationJobs) memoryStore.generationJobs = {}
      if (!memoryStore.buildJobs) memoryStore.buildJobs = {}
      if (!memoryStore.artifacts) memoryStore.artifacts = {}
      if (!memoryStore.shareableLinks) memoryStore.shareableLinks = {}
      return memoryStore
    }
  } catch (err) {
    console.warn('Could not read persistent DB file, starting clean memory store:', err)
  }

  memoryStore = {
    profiles: {},
    credentials: {},
    sessions: {},
    resetTokens: {},
    verificationCodes: {},
    projects: {},
    conversations: {},
    messages: {},
    aiUsageLogs: {},
    projectFiles: {},
    projectFileVersions: {},
    projectSnapshots: {},
    agentRuns: {},
    agentOperations: {},
    notes: {},
    reviews: {},
    documents: {},
    contextMemories: {},
    media: {},
    generationJobs: {},
    buildJobs: {},
    artifacts: {},
    shareableLinks: {},
  }
  return memoryStore
}

function saveDatabase() {
  if (!memoryStore) return
  ensurePersistenceDir()
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(memoryStore, null, 2), 'utf8')
  } catch (err) {
    console.warn('Could not write persistent DB file:', err)
  }
}

export const db = {
  // --------------------------------------------------------------------------
  // USER PROFILES & AUTH CREDENTIALS
  // --------------------------------------------------------------------------

  async findUserByEmail(email: string): Promise<UserProfile | null> {
    const normalized = email.trim().toLowerCase()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', normalized)
          .maybeSingle()
        if (error) throw error
        if (data) return data as UserProfile
      } catch (err) {
        console.warn('Supabase findUserByEmail fallback:', err)
      }
    }

    const store = loadDatabase()
    const profile = Object.values(store.profiles).find(
      (p) => p.email.toLowerCase() === normalized
    )
    return profile || null
  },

  async findUserById(id: string): Promise<UserProfile | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (error) throw error
        if (data) return data as UserProfile
      } catch (err) {
        console.warn('Supabase findUserById fallback:', err)
      }
    }

    const store = loadDatabase()
    return store.profiles[id] || null
  },

  async createUser(params: {
    email: string
    passwordHash: string
    displayName?: string
    emailVerified?: boolean
  }): Promise<{ profile: UserProfile }> {
    const normalized = params.email.trim().toLowerCase()
    const id = generateUuid()
    const now = new Date().toISOString()
    const displayName = params.displayName?.trim() || normalized.split('@')[0]
    const emailVerified = Boolean(params.emailVerified)

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        // Insert profile
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .insert({
            id,
            email: normalized,
            display_name: displayName,
            email_verified: emailVerified,
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single()
        if (profileErr) throw profileErr

        // Insert password credential
        const { error: credErr } = await supabase.from('auth_credentials').insert({
          user_id: id,
          password_hash: params.passwordHash,
          created_at: now,
          updated_at: now,
        })
        if (credErr) throw credErr

        // Create default starter project for user
        const project = await this.createProject({
          userId: id,
          name: 'My First Project',
          description: 'Starter workspace in VX',
          stack: 'Next.js',
        })

        // Create starter conversation
        await this.createConversation({
          userId: id,
          projectId: project.id,
          title: 'Getting started with VX',
        })

        return { profile: profile as UserProfile }
      } catch (err) {
        console.warn('Supabase remote query failed, falling back to local persistent store:', err)
      }
    }

    const store = loadDatabase()
    const profile: UserProfile = {
      id,
      email: normalized,
      display_name: displayName,
      avatar_url: null,
      email_verified: emailVerified,
      created_at: now,
      updated_at: now,
    }
    const credential: AuthCredential = {
      user_id: id,
      password_hash: params.passwordHash,
      created_at: now,
      updated_at: now,
    }

    store.profiles[id] = profile
    store.credentials[id] = credential
    saveDatabase()

    // Create default starter project for user
    const project = await this.createProject({
      userId: id,
      name: 'My First Project',
      description: 'Starter workspace in VX',
      stack: 'Next.js',
    })

    // Create starter conversation
    await this.createConversation({
      userId: id,
      projectId: project.id,
      title: 'Getting started with VX',
    })

    return { profile }
  },

  async markEmailVerified(userId: string): Promise<UserProfile | null> {
    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .update({
            email_verified: true,
            updated_at: now,
          })
          .eq('id', userId)
          .select('*')
          .single()
        if (error) throw error
        if (data) return data as UserProfile
      } catch (err) {
        console.warn('Supabase markEmailVerified fallback:', err)
      }
    }

    const store = loadDatabase()
    const profile = store.profiles[userId]
    if (!profile) return null
    profile.email_verified = true
    profile.updated_at = now
    saveDatabase()
    return profile
  },

  async getPasswordCredential(userId: string): Promise<AuthCredential | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('auth_credentials')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw error
        if (data) return data as AuthCredential
      } catch (err) {
        console.warn('Supabase getPasswordCredential fallback:', err)
      }
    }

    const store = loadDatabase()
    return store.credentials[userId] || null
  },

  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase
          .from('auth_credentials')
          .update({
            password_hash: newPasswordHash,
            updated_at: now,
          })
          .eq('user_id', userId)
        if (error) throw error

        // Invalidate all existing sessions on password change
        try {
          await supabase.from('auth_sessions').delete().eq('user_id', userId)
        } catch {
          // Ignore
        }
        return
      } catch (err) {
        console.warn('Supabase updatePassword fallback:', err)
      }
    }

    const store = loadDatabase()
    if (store.credentials[userId]) {
      store.credentials[userId].password_hash = newPasswordHash
      store.credentials[userId].updated_at = now
    }
    // Invalidate sessions
    for (const [token, sess] of Object.entries(store.sessions)) {
      if (sess.user_id === userId) {
        delete store.sessions[token]
      }
    }
    saveDatabase()
  },

  async updateUserProfile(
    userId: string,
    updates: { displayName?: string; avatarUrl?: string }
  ): Promise<UserProfile | null> {
    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const payload: Record<string, unknown> = { updated_at: now }
        if (updates.displayName !== undefined) payload.display_name = updates.displayName.trim()
        if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl.trim()

        const { data, error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', userId)
          .select('*')
          .single()
        if (error) throw error
        if (data) return data as UserProfile
      } catch (err) {
        console.warn('Supabase updateUserProfile fallback:', err)
      }
    }

    const store = loadDatabase()
    const profile = store.profiles[userId]
    if (!profile) return null

    if (updates.displayName !== undefined) profile.display_name = updates.displayName.trim()
    if (updates.avatarUrl !== undefined) profile.avatar_url = updates.avatarUrl.trim()
    profile.updated_at = now
    saveDatabase()
    return profile
  },

  // --------------------------------------------------------------------------
  // EMAIL VERIFICATION CODES
  // --------------------------------------------------------------------------

  async createVerificationCode(
    userIdOrParams: string | { userId: string; codeHash: string; expiresAt: Date },
    maybeCodeHash?: string,
    maybeExpiresAt?: Date
  ): Promise<AuthVerificationCode> {
    const userId = typeof userIdOrParams === 'object' ? userIdOrParams.userId : userIdOrParams
    const codeHash = typeof userIdOrParams === 'object' ? userIdOrParams.codeHash : (maybeCodeHash as string)
    const expiresAt = typeof userIdOrParams === 'object' ? userIdOrParams.expiresAt : (maybeExpiresAt as Date)

    const id = generateUuid()
    const now = new Date().toISOString()
    const record: AuthVerificationCode = {
      id,
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt.toISOString(),
      attempts: 0,
      last_resend_at: now,
      resend_count: 0,
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('auth_verification_codes')
          .upsert(record, { onConflict: 'user_id' })
          .select('*')
          .single()
        if (error) throw error
        if (data) return data as AuthVerificationCode
      } catch (err) {
        console.warn('Supabase createVerificationCode fallback:', err)
      }
    }

    const store = loadDatabase()
    store.verificationCodes[userId] = record
    saveDatabase()
    return record
  },

  async getVerificationCodeByUserId(userId: string): Promise<AuthVerificationCode | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('auth_verification_codes')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw error
        if (data) return data as AuthVerificationCode
      } catch (err) {
        console.warn('Supabase getVerificationCodeByUserId fallback:', err)
      }
    }

    const store = loadDatabase()
    return store.verificationCodes[userId] || null
  },

  async incrementVerificationAttempt(userId: string): Promise<number> {
    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const current = await this.getVerificationCodeByUserId(userId)
        const nextCount = (current?.attempts || 0) + 1
        await supabase
          .from('auth_verification_codes')
          .update({ attempts: nextCount, updated_at: now })
          .eq('user_id', userId)
        return nextCount
      } catch (err) {
        console.warn('Supabase incrementVerificationAttempt fallback:', err)
      }
    }

    const store = loadDatabase()
    const existing = store.verificationCodes[userId]
    if (existing) {
      existing.attempts += 1
      existing.updated_at = now
      saveDatabase()
      return existing.attempts
    }
    return 1
  },

  async updateVerificationResend(
    userId: string,
    newCodeHash: string,
    newExpiresAt: Date
  ): Promise<AuthVerificationCode> {
    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const current = await this.getVerificationCodeByUserId(userId)
        const resendCount = (current?.resend_count || 0) + 1
        const { data, error } = await supabase
          .from('auth_verification_codes')
          .update({
            code_hash: newCodeHash,
            expires_at: newExpiresAt.toISOString(),
            attempts: 0,
            last_resend_at: now,
            resend_count: resendCount,
            updated_at: now,
          })
          .eq('user_id', userId)
          .select('*')
          .single()
        if (error) throw error
        if (data) return data as AuthVerificationCode
      } catch (err) {
        console.warn('Supabase updateVerificationResend fallback:', err)
      }
    }

    const store = loadDatabase()
    const current = store.verificationCodes[userId]
    const resendCount = (current?.resend_count || 0) + 1
    const updated: AuthVerificationCode = {
      id: current?.id || generateUuid(),
      user_id: userId,
      code_hash: newCodeHash,
      expires_at: newExpiresAt.toISOString(),
      attempts: 0,
      last_resend_at: now,
      resend_count: resendCount,
      created_at: current?.created_at || now,
      updated_at: now,
    }
    store.verificationCodes[userId] = updated
    saveDatabase()
    return updated
  },

  async deleteVerificationCodes(userId: string): Promise<void> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase.from('auth_verification_codes').delete().eq('user_id', userId)
        if (error) throw error
      } catch (err) {
        console.warn('Supabase deleteVerificationCodes fallback:', err)
      }
    }

    const store = loadDatabase()
    delete store.verificationCodes[userId]
    saveDatabase()
  },

  // --------------------------------------------------------------------------
  // SESSIONS
  // --------------------------------------------------------------------------

  async createSession(userId: string, token: string, expiresAt: Date): Promise<AuthSession> {
    const now = new Date().toISOString()
    const session: AuthSession = {
      token,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('auth_sessions')
          .insert(session)
          .select('*')
          .single()
        if (error) throw error
        if (data) return data as AuthSession
      } catch (err) {
        console.warn('Supabase createSession fallback:', err)
      }
    }

    const store = loadDatabase()
    store.sessions[token] = session
    saveDatabase()
    return session
  },

  async getSession(token: string): Promise<{ session: AuthSession; user: UserProfile } | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data: session, error } = await supabase
          .from('auth_sessions')
          .select('*, profiles(*)')
          .eq('token', token)
          .maybeSingle()
        if (!error && session) {
          // Check expiration
          if (new Date(session.expires_at) < new Date()) {
            try {
              await supabase.from('auth_sessions').delete().eq('token', token)
            } catch {
              // Ignore
            }
            return null
          }

          if (session.profiles) {
            return {
              session: {
                token: session.token,
                user_id: session.user_id,
                expires_at: session.expires_at,
                created_at: session.created_at,
              },
              user: session.profiles as unknown as UserProfile,
            }
          }
        }
      } catch (err) {
        console.warn('Supabase getSession fallback:', err)
      }
    }

    const store = loadDatabase()
    const session = store.sessions[token]
    if (!session) return null

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      delete store.sessions[token]
      saveDatabase()
      return null
    }

    const user = store.profiles[session.user_id]
    if (!user) return null

    return { session, user }
  },

  async deleteSession(token: string): Promise<void> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase.from('auth_sessions').delete().eq('token', token)
        if (error) throw error
      } catch (err) {
        console.warn('Supabase deleteSession fallback:', err)
      }
    }

    const store = loadDatabase()
    delete store.sessions[token]
    saveDatabase()
  },

  // --------------------------------------------------------------------------
  // PASSWORD RESET TOKENS
  // --------------------------------------------------------------------------

  async createResetToken(userId: string, token: string, expiresAt: Date): Promise<AuthResetToken> {
    const now = new Date().toISOString()
    const record: AuthResetToken = {
      token,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase.from('auth_reset_tokens').insert(record)
        if (error) throw error
        return record
      } catch (err) {
        console.warn('Supabase createResetToken fallback:', err)
      }
    }

    const store = loadDatabase()
    store.resetTokens[token] = record
    saveDatabase()
    return record
  },

  async getResetToken(token: string): Promise<AuthResetToken | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('auth_reset_tokens')
          .select('*')
          .eq('token', token)
          .maybeSingle()
        if (error || !data) return null
        if (new Date(data.expires_at) < new Date()) {
          try {
            await supabase.from('auth_reset_tokens').delete().eq('token', token)
          } catch {
            // Ignore
          }
          return null
        }
        return data as AuthResetToken
      } catch (err) {
        console.warn('Supabase getResetToken fallback:', err)
      }
    }

    const store = loadDatabase()
    const record = store.resetTokens[token]
    if (!record) return null
    if (new Date(record.expires_at) < new Date()) {
      delete store.resetTokens[token]
      saveDatabase()
      return null
    }
    return record
  },

  async deleteResetToken(token: string): Promise<void> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase.from('auth_reset_tokens').delete().eq('token', token)
        if (error) throw error
      } catch (err) {
        console.warn('Supabase deleteResetToken fallback:', err)
      }
    }

    const store = loadDatabase()
    delete store.resetTokens[token]
    saveDatabase()
  },

  // --------------------------------------------------------------------------
  // PROJECTS (WITH STRICT USER OWNERSHIP)
  // --------------------------------------------------------------------------

  async listProjectsByUser(userId: string): Promise<ProjectRecord[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
        if (error) throw error
        return (data || []) as ProjectRecord[]
      } catch (err) {
        console.warn('Supabase listProjectsByUser fallback:', err)
      }
    }

    const store = loadDatabase()
    return Object.values(store.projects)
      .filter((p) => p.user_id === userId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  },

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .maybeSingle()
        if (error) throw error
        return data as ProjectRecord | null
      } catch (err) {
        console.warn('Supabase findProjectById fallback:', err)
      }
    }

    const store = loadDatabase()
    return store.projects[projectId] || null
  },

  async createProject(params: {
    userId: string
    name: string
    description?: string
    stack?: string
    target?: 'web' | 'mobile' | 'web_mobile'
  }): Promise<ProjectRecord> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const target = params.target || 'web'
    const record: ProjectRecord = {
      id,
      user_id: params.userId,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      stack: params.stack?.trim() || (target === 'mobile' ? 'Expo · React Native' : 'Next.js'),
      target,
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .insert(record)
          .select('*')
          .single()
        if (error) throw error

        // If mobile or web_mobile, bootstrap mobile files in Supabase
        if (target === 'mobile' || target === 'web_mobile') {
          await this.bootstrapMobileFiles(params.userId, id)
        }

        return data as ProjectRecord
      } catch (err) {
        console.warn('Supabase createProject fallback:', err)
      }
    }

    const store = loadDatabase()
    store.projects[id] = record

    if (target === 'mobile' || target === 'web_mobile') {
      this.bootstrapMobileFilesLocal(params.userId, id, store)
    }

    saveDatabase()
    return record
  },

  async bootstrapMobileFiles(userId: string, projectId: string) {
    const supabase = getSupabaseAdminClient()
    if (!supabase) return

    const now = new Date().toISOString()
    const files = getMobileBootstrapFiles(projectId, userId, now)
    for (const file of files) {
      try {
        await supabase.from('project_files').upsert(file, { onConflict: 'project_id,path' })
      } catch (err) {
        console.warn('Bootstrap mobile file insert error:', err)
      }
    }
  },

  bootstrapMobileFilesLocal(userId: string, projectId: string, store: any) {
    const now = new Date().toISOString()
    const files = getMobileBootstrapFiles(projectId, userId, now)
    for (const file of files) {
      store.projectFiles[file.id] = file
    }
  },

  async updateProject(
    projectId: string,
    userId: string,
    updates: { name?: string; description?: string; stack?: string }
  ): Promise<ProjectRecord | null> {
    const project = await this.findProjectById(projectId)
    if (!project || project.user_id !== userId) {
      return null // Ownership mismatch or not found
    }

    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const payload: Record<string, unknown> = { updated_at: now }
        if (updates.name !== undefined) payload.name = updates.name.trim()
        if (updates.description !== undefined) payload.description = updates.description.trim()
        if (updates.stack !== undefined) payload.stack = updates.stack.trim()

        const { data, error } = await supabase
          .from('projects')
          .update(payload)
          .eq('id', projectId)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (error) throw error
        return data as ProjectRecord
      } catch (err) {
        console.warn('Supabase updateProject fallback:', err)
      }
    }

    const store = loadDatabase()
    const existing = store.projects[projectId]
    if (!existing || existing.user_id !== userId) return null

    if (updates.name !== undefined) existing.name = updates.name.trim()
    if (updates.description !== undefined) existing.description = updates.description.trim()
    if (updates.stack !== undefined) existing.stack = updates.stack.trim()
    existing.updated_at = now
    saveDatabase()
    return existing
  },

  async deleteProject(projectId: string, userId: string): Promise<boolean> {
    const project = await this.findProjectById(projectId)
    if (!project || project.user_id !== userId) {
      return false // Ownership mismatch or not found
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', projectId)
          .eq('user_id', userId)
        if (error) throw error
        return true
      } catch (err) {
        console.warn('Supabase deleteProject fallback:', err)
      }
    }

    const store = loadDatabase()
    if (store.projects[projectId] && store.projects[projectId].user_id === userId) {
      delete store.projects[projectId]
      // Cascade delete conversations belonging to this project
      for (const [cId, convo] of Object.entries(store.conversations)) {
        if (convo.project_id === projectId) {
          delete store.conversations[cId]
        }
      }
      saveDatabase()
      return true
    }
    return false
  },

  // --------------------------------------------------------------------------
  // CONVERSATIONS
  // --------------------------------------------------------------------------

  async listConversationsByUser(
    userId: string,
    options?: {
      projectId?: string
      includeArchived?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<ConversationRecord[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        let query = supabase
          .from('conversations')
          .select('*')
          .eq('user_id', userId)

        if (options?.projectId) {
          query = query.eq('project_id', options.projectId)
        }
        if (!options?.includeArchived) {
          query = query.eq('archived', false)
        }

        query = query
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false })

        if (options?.limit) {
          const offset = options.offset || 0
          query = query.range(offset, offset + options.limit - 1)
        }

        const { data, error } = await query
        if (error) throw error
        return (data || []) as ConversationRecord[]
      } catch (err) {
        console.warn('Supabase listConversationsByUser fallback:', err)
      }
    }

    const store = loadDatabase()
    let list = Object.values(store.conversations).filter((c) => c.user_id === userId)

    if (options?.projectId) {
      list = list.filter((c) => c.project_id === options.projectId)
    }
    if (!options?.includeArchived) {
      list = list.filter((c) => !c.archived)
    }

    list.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    if (options?.limit) {
      const offset = options.offset || 0
      list = list.slice(offset, offset + options.limit)
    }

    return list
  },

  async findConversationById(conversationId: string): Promise<ConversationRecord | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .maybeSingle()
        if (error) throw error
        return data as ConversationRecord | null
      } catch (err) {
        console.warn('Supabase findConversationById fallback:', err)
      }
    }

    const store = loadDatabase()
    return store.conversations[conversationId] || null
  },

  async createConversation(params: {
    userId: string
    projectId: string
    title?: string
  }): Promise<ConversationRecord> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const record: ConversationRecord = {
      id,
      user_id: params.userId,
      project_id: params.projectId,
      title: params.title?.trim() || 'New chat',
      pinned: false,
      archived: false,
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .insert(record)
          .select('*')
          .single()
        if (error) throw error
        return data as ConversationRecord
      } catch (err) {
        console.warn('Supabase createConversation fallback:', err)
      }
    }

    const store = loadDatabase()
    store.conversations[id] = record
    saveDatabase()
    return record
  },

  async updateConversation(
    conversationId: string,
    userId: string,
    updates: {
      title?: string
      pinned?: boolean
      archived?: boolean
      projectId?: string
    }
  ): Promise<ConversationRecord | null> {
    const convo = await this.findConversationById(conversationId)
    if (!convo || convo.user_id !== userId) {
      return null
    }

    // If moving to another project, verify user owns the destination project
    if (updates.projectId !== undefined && updates.projectId !== convo.project_id) {
      const destProject = await this.findProjectById(updates.projectId)
      if (!destProject || destProject.user_id !== userId) {
        return null // Cannot move to a project owned by another user or non-existent
      }
    }

    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const payload: Record<string, unknown> = { updated_at: now }
        if (updates.title !== undefined) payload.title = updates.title.trim()
        if (updates.pinned !== undefined) payload.pinned = updates.pinned
        if (updates.archived !== undefined) payload.archived = updates.archived
        if (updates.projectId !== undefined) payload.project_id = updates.projectId

        const { data, error } = await supabase
          .from('conversations')
          .update(payload)
          .eq('id', conversationId)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (error) throw error
        return data as ConversationRecord
      } catch (err) {
        console.warn('Supabase updateConversation fallback:', err)
      }
    }

    const store = loadDatabase()
    const existing = store.conversations[conversationId]
    if (!existing || existing.user_id !== userId) return null

    if (updates.title !== undefined) existing.title = updates.title.trim()
    if (updates.pinned !== undefined) existing.pinned = updates.pinned
    if (updates.archived !== undefined) existing.archived = updates.archived
    if (updates.projectId !== undefined) existing.project_id = updates.projectId
    existing.updated_at = now
    saveDatabase()
    return existing
  },

  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const convo = await this.findConversationById(conversationId)
    if (!convo || convo.user_id !== userId) {
      return false
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase
          .from('conversations')
          .delete()
          .eq('id', conversationId)
          .eq('user_id', userId)
        if (error) throw error
        return true
      } catch (err) {
        console.warn('Supabase deleteConversation fallback:', err)
      }
    }

    const store = loadDatabase()
    if (store.conversations[conversationId] && store.conversations[conversationId].user_id === userId) {
      // Delete associated messages in memory
      for (const [mId, msg] of Object.entries(store.messages)) {
        if (msg.conversation_id === conversationId) {
          delete store.messages[mId]
        }
      }
      delete store.conversations[conversationId]
      saveDatabase()
      return true
    }
    return false
  },

  // --------------------------------------------------------------------------
  // MESSAGES
  // --------------------------------------------------------------------------

  async listMessagesByConversation(
    conversationId: string,
    userId: string,
    options?: { limit?: number; before?: string }
  ): Promise<MessageRecord[]> {
    // Verify conversation ownership
    const convo = await this.findConversationById(conversationId)
    if (!convo || convo.user_id !== userId) {
      return []
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        let query = supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })

        if (options?.before) {
          query = query.lt('created_at', options.before)
        }
        if (options?.limit) {
          query = query.limit(options.limit)
        }

        const { data, error } = await query
        if (error) throw error
        return (data || []) as MessageRecord[]
      } catch (err) {
        console.warn('Supabase listMessagesByConversation fallback:', err)
      }
    }

    const store = loadDatabase()
    let list = Object.values(store.messages).filter(
      (m) => m.conversation_id === conversationId && m.user_id === userId
    )

    if (options?.before) {
      const beforeTime = new Date(options.before).getTime()
      list = list.filter((m) => new Date(m.created_at).getTime() < beforeTime)
    }

    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    if (options?.limit) {
      list = list.slice(-options.limit)
    }

    return list
  },

  async createMessage(params: {
    conversationId: string
    userId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    metadata?: Record<string, unknown>
  }): Promise<MessageRecord | null> {
    // Verify conversation ownership
    const convo = await this.findConversationById(params.conversationId)
    if (!convo || convo.user_id !== params.userId) {
      return null
    }

    const id = generateUuid()
    const now = new Date().toISOString()
    const record: MessageRecord = {
      id,
      conversation_id: params.conversationId,
      user_id: params.userId,
      role: params.role,
      content: params.content,
      metadata: params.metadata || {},
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('messages').insert(record).select('*').single()
        if (error) throw error

        // Update conversation updated_at
        try {
          await supabase
            .from('conversations')
            .update({ updated_at: now })
            .eq('id', params.conversationId)
        } catch {
          // Ignore
        }

        return data as MessageRecord
      } catch (err) {
        console.warn('Supabase createMessage fallback:', err)
      }
    }

    const store = loadDatabase()
    store.messages[id] = record
    if (store.conversations[params.conversationId]) {
      store.conversations[params.conversationId].updated_at = now
    }
    saveDatabase()
    return record
  },

  async logAiUsage(params: {
    userId: string
    projectId?: string | null
    conversationId?: string | null
    modelId: string
    provider: string
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    status?: string
    errorMessage?: string | null
  }): Promise<AiUsageLog> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const promptTokens = params.promptTokens || 0
    const completionTokens = params.completionTokens || 0
    const totalTokens = params.totalTokens || promptTokens + completionTokens

    const log: AiUsageLog = {
      id,
      user_id: params.userId,
      project_id: params.projectId || null,
      conversation_id: params.conversationId || null,
      model_id: params.modelId,
      provider: params.provider,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      status: params.status || 'success',
      error_message: params.errorMessage || null,
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('ai_usage_logs').insert(log).select('*').single()
        if (!error && data) return data as AiUsageLog
      } catch (err) {
        console.warn('Supabase logAiUsage fallback:', err)
      }
    }

    const store = loadDatabase()
    if (!store.aiUsageLogs) store.aiUsageLogs = {}
    store.aiUsageLogs[id] = log
    saveDatabase()
    return log
  },

  async listAiUsageByUser(userId: string, limit = 50): Promise<AiUsageLog[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('ai_usage_logs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (!error && data) return data as AiUsageLog[]
      } catch (err) {
        console.warn('Supabase listAiUsageByUser fallback:', err)
      }
    }

    const store = loadDatabase()
    return Object.values(store.aiUsageLogs || {})
      .filter((l) => l.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
  },

  // --------------------------------------------------------------------------
  // PROJECT FILE SYSTEM METHODS
  // --------------------------------------------------------------------------

  async listProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .order('path', { ascending: true })
        if (!error && data) return data as ProjectFile[]
      } catch (err) {
        console.warn('Supabase listProjectFiles fallback:', err)
      }
    }

    const store = loadDatabase()
    return Object.values(store.projectFiles || {})
      .filter((f) => f.project_id === projectId)
      .sort((a, b) => a.path.localeCompare(b.path))
  },

  async getProjectFileByPath(projectId: string, filePath: string): Promise<ProjectFile | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('path', filePath)
          .maybeSingle()
        if (!error && data) return data as ProjectFile
      } catch (err) {
        console.warn('Supabase getProjectFileByPath fallback:', err)
      }
    }

    const store = loadDatabase()
    const found = Object.values(store.projectFiles || {}).find(
      (f) => f.project_id === projectId && f.path === filePath
    )
    return found || null
  },

  async createOrUpdateProjectFile(params: {
    projectId: string
    userId: string
    path: string
    name: string
    content?: string
    isFolder?: boolean
    mimeType?: string
    expectedVersion?: number
  }): Promise<ProjectFile> {
    const store = loadDatabase()
    const now = new Date().toISOString()
    const isFolder = Boolean(params.isFolder)
    const content = isFolder ? '' : params.content || ''
    const mimeType = params.mimeType || (isFolder ? 'folder' : 'text/plain')

    const existing = await this.getProjectFileByPath(params.projectId, params.path)

    if (existing && params.expectedVersion !== undefined && existing.version !== params.expectedVersion) {
      throw new Error(`Conflict error: File "${params.path}" version is ${existing.version}, expected ${params.expectedVersion}`)
    }

    const nextVersion = existing ? existing.version + 1 : 1
    const fileId = existing ? existing.id : generateUuid()

    const record: ProjectFile = {
      id: fileId,
      project_id: params.projectId,
      user_id: params.userId,
      path: params.path,
      name: params.name,
      is_folder: isFolder,
      content,
      mime_type: mimeType,
      size: Buffer.byteLength(content, 'utf8'),
      version: nextVersion,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_files').upsert(record).select('*').single()
        if (!error && data) {
          if (!isFolder) {
            try {
              await supabase.from('project_file_versions').insert({
                id: generateUuid(),
                file_id: fileId,
                project_id: params.projectId,
                version: nextVersion,
                content,
                created_at: now,
              })
            } catch {
              // ignore version insert failure
            }
          }
          return data as ProjectFile
        }
      } catch (err) {
        console.warn('Supabase createOrUpdateProjectFile fallback:', err)
      }
    }

    if (!store.projectFiles) store.projectFiles = {}
    store.projectFiles[fileId] = record

    if (!isFolder) {
      if (!store.projectFileVersions) store.projectFileVersions = {}
      const versionId = generateUuid()
      store.projectFileVersions[versionId] = {
        id: versionId,
        file_id: fileId,
        project_id: params.projectId,
        version: nextVersion,
        content,
        created_at: now,
      }
    }

    saveDatabase()
    return record
  },

  async deleteProjectFile(projectId: string, filePath: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { error } = await supabase
          .from('project_files')
          .delete()
          .eq('project_id', projectId)
          .or(`path.eq.${filePath},path.like.${filePath}/%`)
        if (!error) return true
      } catch (err) {
        console.warn('Supabase deleteProjectFile fallback:', err)
      }
    }

    const store = loadDatabase()
    let deletedCount = 0
    const prefix = `${filePath}/`

    for (const [id, f] of Object.entries(store.projectFiles || {})) {
      if (f.project_id === projectId && (f.path === filePath || f.path.startsWith(prefix))) {
        delete store.projectFiles[id]
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      saveDatabase()
      return true
    }
    return false
  },

  async renameOrMoveProjectFile(
    projectId: string,
    oldPath: string,
    newPath: string,
    newName: string
  ): Promise<ProjectFile> {
    const target = await this.getProjectFileByPath(projectId, oldPath)
    if (!target) {
      throw new Error(`File or folder at "${oldPath}" not found`)
    }

    const isFolder = target.is_folder
    const oldPrefix = `${oldPath}/`
    const newPrefix = `${newPath}/`

    const allFiles = await this.listProjectFiles(projectId)

    const updated = await this.createOrUpdateProjectFile({
      projectId,
      userId: target.user_id,
      path: newPath,
      name: newName,
      content: target.content,
      isFolder: target.is_folder,
      mimeType: target.mime_type,
    })

    await this.deleteProjectFile(projectId, oldPath)

    if (isFolder) {
      for (const child of allFiles) {
        if (child.path.startsWith(oldPrefix)) {
          const childSubPath = child.path.slice(oldPrefix.length)
          const childNewPath = `${newPrefix}${childSubPath}`
          const childNewName = childSubPath.split('/').pop() || child.name
          await this.createOrUpdateProjectFile({
            projectId,
            userId: child.user_id,
            path: childNewPath,
            name: childNewName,
            content: child.content,
            isFolder: child.is_folder,
            mimeType: child.mime_type,
          })
          await this.deleteProjectFile(projectId, child.path)
        }
      }
    }

    return updated
  },

  async searchProjectFiles(projectId: string, query: string): Promise<ProjectFile[]> {
    const cleanQuery = query.toLowerCase().trim()
    if (!cleanQuery) return []

    const allFiles = await this.listProjectFiles(projectId)
    return allFiles.filter((f) => {
      if (f.is_folder) return false
      return (
        f.name.toLowerCase().includes(cleanQuery) ||
        f.path.toLowerCase().includes(cleanQuery) ||
        f.content.toLowerCase().includes(cleanQuery)
      )
    })
  },

  // --------------------------------------------------------------------------
  // PROJECT SNAPSHOTS
  // --------------------------------------------------------------------------

  async createProjectSnapshot(params: {
    projectId: string
    userId: string
    conversationId?: string | null
    description: string
  }): Promise<ProjectSnapshot> {
    const files = await this.listProjectFiles(params.projectId)
    const id = generateUuid()
    const now = new Date().toISOString()

    const snapshot: ProjectSnapshot = {
      id,
      project_id: params.projectId,
      user_id: params.userId,
      conversation_id: params.conversationId || null,
      description: params.description,
      files_snapshot: files.map((f) => ({
        path: f.path,
        is_folder: f.is_folder,
        content: f.content,
        version: f.version,
      })),
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_snapshots').insert(snapshot).select('*').single()
        if (!error && data) return data as ProjectSnapshot
      } catch (err) {
        console.warn('Supabase createProjectSnapshot fallback:', err)
      }
    }

    const store = loadDatabase()
    if (!store.projectSnapshots) store.projectSnapshots = {}
    store.projectSnapshots[id] = snapshot
    saveDatabase()
    return snapshot
  },

  async listProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_snapshots')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        if (!error && data) return data as ProjectSnapshot[]
      } catch (err) {
        console.warn('Supabase listProjectSnapshots fallback:', err)
      }
    }

    const store = loadDatabase()
    return Object.values(store.projectSnapshots || {})
      .filter((s) => s.project_id === projectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  async restoreProjectSnapshot(snapshotId: string, userId: string): Promise<boolean> {
    const store = loadDatabase()
    const snapshot = store.projectSnapshots?.[snapshotId]
    if (!snapshot) return false

    const existingFiles = await this.listProjectFiles(snapshot.project_id)
    for (const f of existingFiles) {
      await this.deleteProjectFile(snapshot.project_id, f.path)
    }

    for (const item of snapshot.files_snapshot) {
      const parts = item.path.split('/')
      const name = parts[parts.length - 1] || item.path
      await this.createOrUpdateProjectFile({
        projectId: snapshot.project_id,
        userId,
        path: item.path,
        name,
        content: item.content,
        isFolder: item.is_folder,
      })
    }

    return true
  },

  // --------------------------------------------------------------------------
  // AGENT RUNS & AGENT OPERATIONS
  // --------------------------------------------------------------------------

  async createAgentRun(params: {
    userId: string
    projectId: string
    conversationId: string
    modelId: string
  }): Promise<AgentRun> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const run: AgentRun = {
      id,
      user_id: params.userId,
      project_id: params.projectId,
      conversation_id: params.conversationId,
      model_id: params.modelId,
      status: 'running',
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('agent_runs').insert(run).select('*').single()
        if (!error && data) return data as AgentRun
      } catch (err) {
        console.warn('Supabase createAgentRun fallback:', err)
      }
    }

    const store = loadDatabase()
    if (!store.agentRuns) store.agentRuns = {}
    store.agentRuns[id] = run
    saveDatabase()
    return run
  },

  async updateAgentRun(runId: string, updates: Partial<AgentRun>): Promise<AgentRun | null> {
    const now = new Date().toISOString()
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('agent_runs')
          .update({ ...updates, updated_at: now })
          .eq('id', runId)
          .select('*')
          .single()
        if (!error && data) return data as AgentRun
      } catch (err) {
        console.warn('Supabase updateAgentRun fallback:', err)
      }
    }

    const store = loadDatabase()
    const existing = store.agentRuns?.[runId]
    if (!existing) return null

    const updated = { ...existing, ...updates, updated_at: now }
    store.agentRuns[runId] = updated
    saveDatabase()
    return updated
  },

  async logAgentOperation(params: {
    runId: string
    projectId: string
    operationType: AgentOperation['operation_type']
    filePath: string
    status: 'success' | 'failed'
    details?: string
  }): Promise<AgentOperation> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const op: AgentOperation = {
      id,
      run_id: params.runId,
      project_id: params.projectId,
      operation_type: params.operationType,
      file_path: params.filePath,
      status: params.status,
      details: params.details || null,
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('agent_operations').insert(op).select('*').single()
        if (!error && data) return data as AgentOperation
      } catch (err) {
        console.warn('Supabase logAgentOperation fallback:', err)
      }
    }

    const store = loadDatabase()
    if (!store.agentOperations) store.agentOperations = {}
    store.agentOperations[id] = op
    saveDatabase()
    return op
  },

  // ==========================================
  // Work Intelligence: Project Notes
  // ==========================================
  async createProjectNote(params: {
    projectId: string
    userId: string
    title: string
    category: NoteCategory
    content: string
  }): Promise<ProjectNote> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const note: ProjectNote = {
      id,
      project_id: params.projectId,
      user_id: params.userId,
      title: params.title,
      category: params.category,
      content: params.content,
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_notes').insert(note).select('*').single()
        if (!error && data) return data as ProjectNote
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.notes) store.notes = {}
    store.notes[id] = note
    saveDatabase()
    return note
  },

  async listProjectNotes(projectId: string, userId: string): Promise<ProjectNote[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_notes')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
        if (!error && data) return data as ProjectNote[]
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.notes) return []
    return Object.values(store.notes)
      .filter((n) => n.project_id === projectId && n.user_id === userId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  },

  async getProjectNoteById(noteId: string, userId: string): Promise<ProjectNote | null> {
    const store = loadDatabase()
    if (!store.notes || !store.notes[noteId]) return null
    const note = store.notes[noteId]
    if (note.user_id !== userId) return null
    return note
  },

  async updateProjectNote(
    noteId: string,
    userId: string,
    updates: Partial<Pick<ProjectNote, 'title' | 'category' | 'content'>>
  ): Promise<ProjectNote | null> {
    const existing = await this.getProjectNoteById(noteId, userId)
    if (!existing) return null

    const updated: ProjectNote = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_notes')
          .update(updated)
          .eq('id', noteId)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (!error && data) return data as ProjectNote
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.notes) store.notes = {}
    store.notes[noteId] = updated
    saveDatabase()
    return updated
  },

  async deleteProjectNote(noteId: string, userId: string): Promise<boolean> {
    const existing = await this.getProjectNoteById(noteId, userId)
    if (!existing) return false

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        await supabase.from('project_notes').delete().eq('id', noteId).eq('user_id', userId)
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (store.notes && store.notes[noteId]) {
      delete store.notes[noteId]
      saveDatabase()
    }
    return true
  },

  // ==========================================
  // Work Intelligence: Project Reviews
  // ==========================================
  async createProjectReview(params: {
    projectId: string
    userId: string
    scope: ProjectReview['scope']
    findings: ProjectReview['findings']
    summary: string
  }): Promise<ProjectReview> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const review: ProjectReview = {
      id,
      project_id: params.projectId,
      user_id: params.userId,
      scope: params.scope,
      findings: params.findings,
      summary: params.summary,
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_reviews').insert(review).select('*').single()
        if (!error && data) return data as ProjectReview
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.reviews) store.reviews = {}
    store.reviews[id] = review
    saveDatabase()
    return review
  },

  async getLatestProjectReview(projectId: string, userId: string): Promise<ProjectReview | null> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_reviews')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (!error && data) return data as ProjectReview
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.reviews) return null
    const list = Object.values(store.reviews)
      .filter((r) => r.project_id === projectId && r.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return list[0] || null
  },

  // ==========================================
  // Work Intelligence: Document Analyses
  // ==========================================
  async saveDocumentAnalysis(params: {
    projectId: string
    userId: string
    filename: string
    fileType: string
    size: number
    summary: string
    extractedRequirements: string[]
    keyPoints: string[]
    contentPreview?: string
  }): Promise<DocumentAnalysisRecord> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const record: DocumentAnalysisRecord = {
      id,
      project_id: params.projectId,
      user_id: params.userId,
      filename: params.filename,
      file_type: params.fileType,
      size: params.size,
      summary: params.summary,
      extracted_requirements: params.extractedRequirements,
      key_points: params.keyPoints,
      content_preview: params.contentPreview,
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('document_analyses').insert(record).select('*').single()
        if (!error && data) return data as DocumentAnalysisRecord
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.documents) store.documents = {}
    store.documents[id] = record
    saveDatabase()
    return record
  },

  async listDocumentAnalyses(projectId: string, userId: string): Promise<DocumentAnalysisRecord[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('document_analyses')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (!error && data) return data as DocumentAnalysisRecord[]
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.documents) return []
    return Object.values(store.documents)
      .filter((d) => d.project_id === projectId && d.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  // ==========================================
  // Work Intelligence: Project Context Memory
  // ==========================================
  async getProjectContextMemory(projectId: string, userId: string): Promise<ProjectContextMemory | null> {
    const store = loadDatabase()
    if (!store.contextMemories) store.contextMemories = {}
    const mem = Object.values(store.contextMemories).find(
      (m) => m.project_id === projectId && m.user_id === userId
    )
    return mem || null
  },

  async updateProjectContextMemory(
    projectId: string,
    userId: string,
    updates: Partial<Pick<ProjectContextMemory, 'overview' | 'architecture_summary' | 'confirmed_requirements' | 'user_decisions' | 'ai_recommendations'>>
  ): Promise<ProjectContextMemory> {
    const store = loadDatabase()
    if (!store.contextMemories) store.contextMemories = {}
    let existing = Object.values(store.contextMemories).find(
      (m) => m.project_id === projectId && m.user_id === userId
    )

    const now = new Date().toISOString()
    if (!existing) {
      existing = {
        id: generateUuid(),
        project_id: projectId,
        user_id: userId,
        overview: updates.overview || '',
        architecture_summary: updates.architecture_summary || '',
        confirmed_requirements: updates.confirmed_requirements || [],
        user_decisions: updates.user_decisions || [],
        ai_recommendations: updates.ai_recommendations || [],
        updated_at: now,
      }
    } else {
      existing = {
        ...existing,
        ...updates,
        updated_at: now,
      }
    }

    store.contextMemories[existing.id] = existing
    saveDatabase()
    return existing
  },

  // ==========================================
  // Phase 12: Project Media & Library
  // ==========================================
  async createProjectMedia(params: any): Promise<ProjectMedia> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const projectId = params.project_id || params.projectId
    const userId = params.user_id || params.userId
    const record: ProjectMedia = {
      id,
      storage_path: params.storage_path || params.storagePath || '',
      file_name: params.file_name || params.fileName || '',
      display_name: params.display_name || params.displayName || '',
      file_type: params.file_type || params.fileType || 'other',
      mime_type: params.mime_type || params.mimeType || 'application/octet-stream',
      size_bytes: params.size_bytes || params.sizeBytes || 0,
      source_type: params.source_type || params.sourceType || 'generated',
      generation_status: params.generation_status || params.generationStatus || 'completed',
      prompt: params.prompt || null,
      ...params,
      project_id: projectId,
      user_id: userId,
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_media').insert(record).select('*').single()
        if (error) throw error
        if (data) return data as ProjectMedia
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.media) store.media = {}
    store.media[id] = record
    saveDatabase()
    return record
  },

  async listProjectMedia(
    projectId: string,
    userId: string,
    options?: {
      fileType?: string
      sourceType?: string
      search?: string
      includeDeleted?: boolean
    }
  ): Promise<ProjectMedia[]> {
    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        let query = supabase
          .from('project_media')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)

        if (!options?.includeDeleted) {
          query = query.is('deleted_at', null)
        }
        if (options?.fileType && options.fileType !== 'all') {
          query = query.eq('file_type', options.fileType)
        }
        if (options?.sourceType && options.sourceType !== 'all') {
          query = query.eq('source_type', options.sourceType)
        }

        const { data, error } = await query.order('created_at', { ascending: false })
        if (error) throw error
        if (data) {
          let list = data as ProjectMedia[]
          if (options?.search) {
            const term = options.search.toLowerCase()
            list = list.filter(
              (m) =>
                m.file_name.toLowerCase().includes(term) ||
                m.display_name.toLowerCase().includes(term) ||
                (m.prompt && m.prompt.toLowerCase().includes(term))
            )
          }
          return list
        }
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.media) return []

    let list = Object.values(store.media).filter(
      (m) => m.project_id === projectId && m.user_id === userId
    )

    if (!options?.includeDeleted) {
      list = list.filter((m) => !m.deleted_at)
    }
    if (options?.fileType && options.fileType !== 'all') {
      list = list.filter((m) => m.file_type === options.fileType)
    }
    if (options?.sourceType && options.sourceType !== 'all') {
      list = list.filter((m) => m.source_type === options.sourceType)
    }
    if (options?.search) {
      const term = options.search.toLowerCase()
      list = list.filter(
        (m) =>
          m.file_name.toLowerCase().includes(term) ||
          m.display_name.toLowerCase().includes(term) ||
          (m.prompt && m.prompt.toLowerCase().includes(term))
      )
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  async getProjectMediaById(mediaId: string, userId: string): Promise<ProjectMedia | null> {
    const store = loadDatabase()
    if (!store.media || !store.media[mediaId]) return null
    const item = store.media[mediaId]
    if (item.user_id !== userId) return null
    return item
  },

  async updateProjectMedia(
    mediaId: string,
    userId: string,
    updates: Partial<Omit<ProjectMedia, 'id' | 'project_id' | 'user_id' | 'created_at'>>
  ): Promise<ProjectMedia | null> {
    const existing = await this.getProjectMediaById(mediaId, userId)
    if (!existing) return null

    const updated: ProjectMedia = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('project_media')
          .update(updated)
          .eq('id', mediaId)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (!error && data) return data as ProjectMedia
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.media) store.media = {}
    store.media[mediaId] = updated
    saveDatabase()
    return updated
  },

  async deleteProjectMedia(mediaId: string, userId: string, hardDelete = false): Promise<boolean> {
    const existing = await this.getProjectMediaById(mediaId, userId)
    if (!existing) return false

    if (hardDelete) {
      const supabase = getSupabaseAdminClient()
      if (supabase) {
        try {
          await supabase.from('project_media').delete().eq('id', mediaId).eq('user_id', userId)
        } catch {
          // fallback
        }
      }

      const store = loadDatabase()
      if (store.media && store.media[mediaId]) {
        delete store.media[mediaId]
        saveDatabase()
      }
      return true
    } else {
      await this.updateProjectMedia(mediaId, userId, {
        deleted_at: new Date().toISOString(),
      })
      return true
    }
  },

  async getProjectStorageStats(projectId: string, userId: string): Promise<{
    totalBytes: number
    fileCount: number
    quotaBytes: number
    byType: Record<string, { bytes: number; count: number }>
  }> {
    const mediaList = await this.listProjectMedia(projectId, userId, { includeDeleted: false })
    const byType: Record<string, { bytes: number; count: number }> = {
      image: { bytes: 0, count: 0 },
      video: { bytes: 0, count: 0 },
      audio: { bytes: 0, count: 0 },
      script: { bytes: 0, count: 0 },
      document: { bytes: 0, count: 0 },
      other: { bytes: 0, count: 0 },
    }

    let totalBytes = 0
    for (const m of mediaList) {
      const size = Number(m.size_bytes) || 0
      totalBytes += size
      const t = m.file_type || 'other'
      if (!byType[t]) byType[t] = { bytes: 0, count: 0 }
      byType[t].bytes += size
      byType[t].count += 1
    }

    // Default 5GB quota per project
    const quotaBytes = Number(process.env.STORAGE_QUOTA_BYTES) || 5 * 1024 * 1024 * 1024

    return {
      totalBytes,
      fileCount: mediaList.length,
      quotaBytes,
      byType,
    }
  },

  // ==========================================
  // Phase 12: Generation Jobs
  // ==========================================
  async createGenerationJob(params: Omit<GenerationJob, 'id' | 'created_at'>): Promise<GenerationJob> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const job: GenerationJob = {
      id,
      ...params,
      created_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('generation_jobs').insert(job).select('*').single()
        if (!error && data) return data as GenerationJob
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.generationJobs) store.generationJobs = {}
    store.generationJobs[id] = job
    saveDatabase()
    return job
  },

  async getGenerationJobById(jobId: string, userId: string): Promise<GenerationJob | null> {
    const store = loadDatabase()
    if (!store.generationJobs || !store.generationJobs[jobId]) return null
    const job = store.generationJobs[jobId]
    if (job.user_id !== userId) return null
    return job
  },

  async updateGenerationJob(
    jobId: string,
    userId: string,
    updates: Partial<Omit<GenerationJob, 'id' | 'project_id' | 'user_id' | 'created_at'>>
  ): Promise<GenerationJob | null> {
    const existing = await this.getGenerationJobById(jobId, userId)
    if (!existing) return null

    const updated: GenerationJob = {
      ...existing,
      ...updates,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('generation_jobs')
          .update(updated)
          .eq('id', jobId)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (!error && data) return data as GenerationJob
      } catch {
        // fallback
      }
    }

    const store = loadDatabase()
    if (!store.generationJobs) store.generationJobs = {}
    store.generationJobs[jobId] = updated
    saveDatabase()
    return updated
  },

  async listGenerationJobs(projectId: string, userId: string, limit = 30): Promise<GenerationJob[]> {
    const store = loadDatabase()
    if (!store.generationJobs) return []
    return Object.values(store.generationJobs)
      .filter((j) => j.project_id === projectId && j.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
  },

  // --------------------------------------------------------------------------
  // ANDROID BUILD JOBS & ARTIFACTS
  // --------------------------------------------------------------------------

  async createAndroidBuildJob(params: {
    userId: string
    projectId: string
    projectCheckpointId?: string | null
    version: string
    versionCode: number
  }): Promise<AndroidBuildJob> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const record: AndroidBuildJob = {
      id,
      user_id: params.userId,
      project_id: params.projectId,
      project_checkpoint_id: params.projectCheckpointId || null,
      version: params.version,
      version_code: params.versionCode,
      status: 'queued',
      build_provider: 'vx-standalone-android-builder',
      logs: [`[${now}] Android APK build job queued for project ${params.projectId}`],
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('android_build_jobs').insert(record).select('*').single()
        if (!error && data) return data as AndroidBuildJob
      } catch {
        // Fallback
      }
    }

    const store = loadDatabase()
    if (!store.buildJobs) store.buildJobs = {}
    store.buildJobs[id] = record
    saveDatabase()
    return record
  },

  async updateAndroidBuildJob(
    jobId: string,
    updates: Partial<AndroidBuildJob> & { logMessage?: string }
  ): Promise<AndroidBuildJob | null> {
    const now = new Date().toISOString()
    const store = loadDatabase()
    if (!store.buildJobs) store.buildJobs = {}

    const existing = store.buildJobs[jobId]
    if (!existing) return null

    const updatedLogs = [...existing.logs]
    if (updates.logMessage) {
      updatedLogs.push(`[${now}] ${updates.logMessage}`)
    }

    const updatedRecord: AndroidBuildJob = {
      ...existing,
      ...updates,
      logs: updatedLogs,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('android_build_jobs')
          .update({
            ...updates,
            logs: updatedLogs,
            updated_at: now,
          })
          .eq('id', jobId)
          .select('*')
          .single()
        if (!error && data) return data as AndroidBuildJob
      } catch {
        // Fallback
      }
    }

    store.buildJobs[jobId] = updatedRecord
    saveDatabase()
    return updatedRecord
  },

  async getAndroidBuildJob(jobId: string, userId: string): Promise<AndroidBuildJob | null> {
    const store = loadDatabase()
    if (!store.buildJobs) store.buildJobs = {}
    const job = store.buildJobs[jobId]
    if (job && job.user_id === userId) return job
    return null
  },

  async listAndroidBuildJobs(projectId: string, userId: string, limit = 20): Promise<AndroidBuildJob[]> {
    const store = loadDatabase()
    if (!store.buildJobs) return []
    return Object.values(store.buildJobs)
      .filter((j) => j.project_id === projectId && j.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
  },

  async createProjectArtifact(params: {
    projectId: string
    userId: string
    buildId: string
    artifactType?: 'apk' | 'bundle'
    fileName: string
    storagePath: string
    mimeType: string
    sizeBytes: number
    version: string
    versionCode: number
    checksum: string
  }): Promise<ProjectArtifact> {
    const id = generateUuid()
    const now = new Date().toISOString()
    const record: ProjectArtifact = {
      id,
      project_id: params.projectId,
      user_id: params.userId,
      build_id: params.buildId,
      artifact_type: params.artifactType || 'apk',
      file_name: params.fileName,
      storage_path: params.storagePath,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      version: params.version,
      version_code: params.versionCode,
      checksum: params.checksum,
      status: 'available',
      created_at: now,
      updated_at: now,
    }

    const supabase = getSupabaseAdminClient()
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_artifacts').insert(record).select('*').single()
        if (!error && data) return data as ProjectArtifact
      } catch {
        // Fallback
      }
    }

    const store = loadDatabase()
    if (!store.artifacts) store.artifacts = {}
    store.artifacts[id] = record
    saveDatabase()
    return record
  },

  async getProjectArtifact(artifactId: string, userId?: string): Promise<ProjectArtifact | null> {
    const store = loadDatabase()
    if (!store.artifacts) return null
    const artifact = store.artifacts[artifactId]
    if (!artifact) return null
    if (userId && artifact.user_id !== userId) return null
    return artifact
  },

  async listProjectArtifacts(projectId: string, userId: string): Promise<ProjectArtifact[]> {
    const store = loadDatabase()
    if (!store.artifacts) return []
    return Object.values(store.artifacts)
      .filter((a) => a.project_id === projectId && a.user_id === userId && a.status === 'available')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  async updateProjectArtifactStatus(artifactId: string, userId: string, status: 'available' | 'deleted' | 'expired'): Promise<boolean> {
    const store = loadDatabase()
    if (!store.artifacts) return false
    const artifact = store.artifacts[artifactId]
    if (!artifact || artifact.user_id !== userId) return false

    artifact.status = status
    artifact.updated_at = new Date().toISOString()
    saveDatabase()
    return true
  },

  async createShareableLink(params: {
    artifactId: string
    projectId: string
    userId: string
    expiresAt?: Date | null
  }): Promise<ShareableLink> {
    const id = generateUuid()
    const token = generateUuid().replace(/-/g, '') + generateUuid().replace(/-/g, '')
    const now = new Date().toISOString()

    const record: ShareableLink = {
      id,
      artifact_id: params.artifactId,
      project_id: params.projectId,
      user_id: params.userId,
      token,
      revoked: false,
      download_count: 0,
      expires_at: params.expiresAt ? params.expiresAt.toISOString() : null,
      created_at: now,
      updated_at: now,
    }

    const store = loadDatabase()
    if (!store.shareableLinks) store.shareableLinks = {}
    store.shareableLinks[id] = record
    saveDatabase()
    return record
  },

  async getShareableLinkByToken(token: string): Promise<ShareableLink | null> {
    const store = loadDatabase()
    if (!store.shareableLinks) return null
    const link = Object.values(store.shareableLinks).find((l) => l.token === token && !l.revoked)
    if (!link) return null

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return null
    }

    return link
  },

  async getShareableLinkByArtifact(artifactId: string, userId: string): Promise<ShareableLink | null> {
    const store = loadDatabase()
    if (!store.shareableLinks) return null
    const link = Object.values(store.shareableLinks).find(
      (l) => l.artifact_id === artifactId && l.user_id === userId && !l.revoked
    )
    return link || null
  },

  async incrementShareableLinkDownloads(linkId: string): Promise<void> {
    const store = loadDatabase()
    if (!store.shareableLinks) return
    const link = store.shareableLinks[linkId]
    if (link) {
      link.download_count += 1
      link.updated_at = new Date().toISOString()
      saveDatabase()
    }
  },

  async revokeShareableLink(linkId: string, userId: string): Promise<boolean> {
    const store = loadDatabase()
    if (!store.shareableLinks) return false
    const link = store.shareableLinks[linkId]
    if (!link || link.user_id !== userId) return false

    link.revoked = true
    link.updated_at = new Date().toISOString()
    saveDatabase()
    return true
  },
}

