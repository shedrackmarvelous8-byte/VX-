export type Role = 'user' | 'assistant'

export interface Attachment {
  id: string
  name: string
  size?: number
  kind: 'file' | 'image' | 'code'
}

export interface Message {
  id: string
  role: Role
  /** Markdown content */
  content: string
  attachments?: Attachment[]
  createdAt: number
  /**
   * Contextual cards rendered in place of markdown content (Prompt 3):
   * - 'plan'     → Build Plan + the follow-up agent activity (`plan` + `activity`)
   * - 'activity' → standalone coding-agent activity (`activity`)
   * - 'approval' → major-change approval (`approval`)
   */
  kind?: 'plan' | 'activity' | 'approval'
  plan?: BuildPlan
  activity?: AgentActivity
  approval?: ChangeApproval
}

export interface Conversation {
  id: string
  title: string
  projectId: string
  messages: Message[]
  updatedAt: number
  pinned?: boolean
  archived?: boolean
}

export interface Project {
  id: string
  name: string
  /** Subtle supporting info, e.g. stack */
  stack?: string
  updatedAt?: number
}

/**
 * Contextual workspace surfaces reachable from the sidebar.
 * They open *alongside* the conversation (never replace it) — rendered via AppShell's `aside` slot.
 */
export type Surface = 'files' | 'preview' | 'code' | 'terminal' | 'database' | 'environment' | 'github'

/** Actions available from a recent conversation's context menu. */
export type ConversationAction = 'share' | 'rename' | 'pin' | 'add-to-project' | 'move' | 'archive' | 'delete'

/** Communication mode inside the same conversation. */
export type InputMode = 'text' | 'voice'

/** Selectable model metadata from dynamic backend catalog */
export interface ModelInfo {
  id: string
  name: string
  /** Short capability description */
  description: string
  /** Optional small capability badges, e.g. Coding, Vision, Tools */
  badges?: string[]
  group: 'recommended' | 'more' | 'gemini' | 'openrouter'
  contextWindow?: number
  isRecommended?: boolean
  recommendationReason?: string
}

/** Temporary contextual plan VX presents before generating a project. */
export interface BuildPlan {
  projectType: string
  structure: string[]
  visualDirection: string[]
  features: string[]
  technical: string
  /** Extra instructions from the customize sheet */
  extra?: string
}

/** Edits made in the Build Plan customize sheet. */
export interface PlanCustomization {
  styles: string[]
  colors: string
  pages: string[]
  features: string[]
  animations: string
  extra: string
}

export interface AgentSummaryLine {
  label: string
  status: 'done' | 'warn'
}

/** Coding-agent activity card content (UI only — no real agent). */
export interface AgentActivity {
  steps: string[]
  outcome: 'success' | 'issues'
  /** Result lines shown when the run completes */
  summary: AgentSummaryLine[]
}

/** Major change approval (counts only — content shown in a later step). */
export interface ChangeApproval {
  files: number
  migrations: number
  dependencies: number
}
