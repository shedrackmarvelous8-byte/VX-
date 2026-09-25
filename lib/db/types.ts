export interface UserProfile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  email_verified: boolean
  created_at: string
  updated_at: string
}

export interface AuthSession {
  token: string
  user_id: string
  expires_at: string
  created_at: string
}

export interface AuthCredential {
  user_id: string
  password_hash: string
  created_at: string
  updated_at: string
}

export interface AuthResetToken {
  token: string
  user_id: string
  expires_at: string
  created_at: string
}

export interface AuthVerificationCode {
  id: string
  user_id: string
  code_hash: string
  expires_at: string
  attempts: number
  last_resend_at: string | null
  resend_count: number
  created_at: string
  updated_at: string
}

export interface ProjectRecord {
  id: string
  user_id: string
  name: string
  description: string | null
  stack: string
  target?: 'web' | 'mobile' | 'web_mobile'
  created_at: string
  updated_at: string
}

export interface ConversationRecord {
  id: string
  project_id: string
  user_id: string
  title: string
  pinned: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export interface MessageRecord {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface AiUsageLog {
  id: string
  user_id: string
  project_id: string | null
  conversation_id: string | null
  model_id: string
  provider: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  status: string
  error_message?: string | null
  created_at: string
}

export interface ProjectFile {
  id: string
  project_id: string
  user_id: string
  path: string
  name: string
  is_folder: boolean
  content: string
  mime_type: string
  size: number
  version: number
  is_binary?: boolean
  storage_url?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectFileVersion {
  id: string
  file_id: string
  project_id: string
  version: number
  content: string
  created_at: string
}

export interface ProjectSnapshot {
  id: string
  project_id: string
  user_id: string
  conversation_id?: string | null
  description: string
  files_snapshot: Array<{
    path: string
    is_folder: boolean
    content: string
    version: number
  }>
  created_at: string
}

export interface AgentRun {
  id: string
  user_id: string
  project_id: string
  conversation_id: string
  model_id: string
  status: 'running' | 'completed' | 'failed' | 'requires_approval'
  summary?: string | null
  created_at: string
  updated_at: string
}

export interface AgentOperation {
  id: string
  run_id: string
  project_id: string
  operation_type:
    | 'read'
    | 'write'
    | 'create'
    | 'edit'
    | 'delete'
    | 'create_folder'
    | 'rename'
    | 'move'
    | 'search'
    | 'command'
    | 'install_package'
    | 'build'
    | 'dev_server'
  file_path: string
  status: 'success' | 'failed'
  details?: string | null
  created_at: string
}

export type NoteCategory =
  | 'project_notes'
  | 'requirements'
  | 'technical'
  | 'research'
  | 'ideas'
  | 'meeting'
  | 'decisions'

export interface ProjectNote {
  id: string
  project_id: string
  user_id: string
  title: string
  category: NoteCategory
  content: string
  created_at: string
  updated_at: string
}

export interface ReviewFinding {
  category: string
  observation: string
  recommendation: string
  action?: string
  severity: 'low' | 'medium' | 'high'
}

export interface ProjectReview {
  id: string
  project_id: string
  user_id: string
  scope: 'full' | 'ui' | 'code' | 'security' | 'architecture'
  findings: ReviewFinding[]
  summary: string
  created_at: string
}

export interface DocumentAnalysisRecord {
  id: string
  project_id: string
  user_id: string
  filename: string
  file_type: string
  size: number
  summary: string
  extracted_requirements: string[]
  key_points: string[]
  content_preview?: string
  created_at: string
}

export interface ProjectContextMemory {
  id: string
  project_id: string
  user_id: string
  overview: string
  architecture_summary: string
  confirmed_requirements: string[]
  user_decisions: string[]
  ai_recommendations: string[]
  updated_at: string
}

export type MediaType = 'image' | 'video' | 'audio' | 'script' | 'document' | 'other'
export type MediaSourceType = 'generated' | 'uploaded' | 'reference' | 'imported'
export type GenerationType = 'script' | 'image' | 'video' | 'audio' | 'upload'
export type GenerationJobStatus = 'queued' | 'running' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface ProjectMedia {
  id: string
  project_id: string
  user_id: string
  storage_path: string
  file_name: string
  display_name: string
  file_type: MediaType
  mime_type: string
  size_bytes: number
  width?: number | null
  height?: number | null
  duration?: number | null
  generation_type?: GenerationType
  source_type: MediaSourceType
  model_id?: string | null
  prompt?: string | null
  generation_status: 'completed' | 'failed' | 'processing'
  provider_job_id?: string | null
  thumbnail_path?: string | null
  public_url?: string | null
  version?: number
  parent_media_id?: string | null
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface GenerationJob {
  id: string
  project_id: string
  user_id: string
  media_id?: string | null
  type: GenerationType
  model_id: string
  status: GenerationJobStatus
  provider_job_id?: string | null
  prompt: string
  parameters?: Record<string, any>
  error_message?: string | null
  progress?: number | null
  result_url?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at: string
}

export type AndroidBuildJobStatus =
  | 'queued'
  | 'preparing'
  | 'building'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AndroidBuildJob {
  id: string
  user_id: string
  project_id: string
  project_checkpoint_id?: string | null
  version: string
  version_code: number
  status: AndroidBuildJobStatus
  build_provider: string
  provider_job_id?: string | null
  artifact_id?: string | null
  logs: string[]
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectArtifact {
  id: string
  project_id: string
  user_id: string
  build_id: string
  artifact_type: 'apk' | 'bundle'
  file_name: string
  storage_path: string
  mime_type: string
  size_bytes: number
  version: string
  version_code: number
  checksum: string
  status: 'available' | 'deleted' | 'expired'
  created_at: string
  updated_at: string
}

export interface ShareableLink {
  id: string
  artifact_id: string
  project_id: string
  user_id: string
  token: string
  revoked: boolean
  download_count: number
  expires_at?: string | null
  created_at: string
  updated_at: string
}



