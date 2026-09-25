export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
  name: string | null
  email: string | null
  bio?: string | null
  public_repos?: number
  total_private_repos?: number
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  description: string | null
  default_branch: string
  updated_at: string
  stargazers_count?: number
  language?: string | null
}

export interface GitHubBranch {
  name: string
  commit: {
    sha: string
    url: string
  }
}

export interface GitHubCommitItem {
  sha: string
  message: string
  authorName: string
  authorAvatar?: string
  date: string
  htmlUrl: string
}

export interface ProjectGitLink {
  projectId: string
  repoFullName: string
  branch: string
  repoUrl: string
  isPrivate: boolean
  linkedAt: string
  lastCommitSha?: string
  lastCommitMessage?: string
  lastCommitAt?: string
  lastPushAt?: string
}

export interface ProjectGitStatus {
  connected: boolean
  hasAccount: boolean
  user?: {
    login: string
    avatarUrl: string
    htmlUrl: string
  }
  link?: ProjectGitLink | null
  branch: string
  modifiedFiles: string[]
  addedFiles: string[]
  deletedFiles: string[]
  totalChanges: number
  lastCommit?: GitHubCommitItem | null
  lastPushAt?: string | null
  protectedSecretsDetected: string[]
}

export interface GitCommitPayload {
  message: string
  branch?: string
  createBranchIfNeeded?: boolean
}

export interface GitCommitResult {
  success: boolean
  commitSha?: string
  commitMessage?: string
  branch?: string
  htmlUrl?: string
  filesCommitted?: number
  error?: string
}
