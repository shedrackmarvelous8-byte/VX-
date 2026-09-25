import fs from 'fs'
import path from 'path'
import { getSupabaseAdminClient } from '../db/supabase'
import type { MediaType } from '../db/types'

const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.data', 'storage')
const STORAGE_BUCKET = 'project-media'

function ensureLocalDir(targetPath: string) {
  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function getProjectStoragePath(
  projectId: string,
  fileType: MediaType,
  mediaId: string,
  filename: string
): string {
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase()
  return `projects/${projectId}/media/${fileType}s/${mediaId}_${cleanFilename}`
}

export async function uploadMediaBuffer(params: {
  projectId: string
  userId: string
  mediaId: string
  fileType: MediaType
  filename: string
  buffer: Buffer
  mimeType: string
}): Promise<{
  storagePath: string
  publicUrl?: string
  sizeBytes: number
}> {
  const { projectId, mediaId, fileType, filename, buffer, mimeType } = params
  const storagePath = getProjectStoragePath(projectId, fileType, mediaId, filename)
  const sizeBytes = buffer.length

  // 1. Write to local storage cache for high-speed serving & offline reliability
  const localFile = path.join(LOCAL_STORAGE_DIR, storagePath)
  ensureLocalDir(localFile)
  fs.writeFileSync(localFile, buffer)

  // 2. Upload to Supabase Storage if configured
  const supabase = getSupabaseAdminClient()
  let publicUrl: string | undefined = undefined

  if (supabase) {
    try {
      // Ensure bucket exists or upload directly
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        })

      if (!error) {
        const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
        publicUrl = data?.publicUrl
      } else {
        console.warn('[Supabase Storage Upload Warning]:', error.message)
      }
    } catch (err) {
      console.warn('[Supabase Storage Upload Exception]:', err)
    }
  }

  // Fallback public URL path served via authenticated proxy
  if (!publicUrl) {
    publicUrl = `/api/projects/${projectId}/media/${mediaId}/content`
  }

  return {
    storagePath,
    publicUrl,
    sizeBytes,
  }
}

export async function getMediaBuffer(
  storagePath: string,
  projectId?: string
): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  // 1. Try local filesystem cache first
  const localFile = path.join(LOCAL_STORAGE_DIR, storagePath)
  if (fs.existsSync(localFile)) {
    try {
      const buffer = fs.readFileSync(localFile)
      return { buffer }
    } catch {
      // fallback
    }
  }

  // 2. Try Supabase Storage
  const supabase = getSupabaseAdminClient()
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath)
      if (!error && data) {
        const arrayBuf = await data.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)
        // Cache locally for next time
        ensureLocalDir(localFile)
        fs.writeFileSync(localFile, buffer)
        return { buffer, mimeType: data.type }
      }
    } catch {
      // fallback
    }
  }

  return null
}

export async function deleteMediaBuffer(storagePath: string): Promise<boolean> {
  // 1. Remove local cache
  const localFile = path.join(LOCAL_STORAGE_DIR, storagePath)
  if (fs.existsSync(localFile)) {
    try {
      fs.unlinkSync(localFile)
    } catch {
      // ignore
    }
  }

  // 2. Remove from Supabase Storage
  const supabase = getSupabaseAdminClient()
  if (supabase) {
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    } catch {
      // ignore
    }
  }

  return true
}

export function detectMimeType(filename: string): { mimeType: string; fileType: MediaType } {
  const ext = path.extname(filename).toLowerCase()

  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico'].includes(ext)) {
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
        ? 'image/gif'
        : ext === '.svg'
        ? 'image/svg+xml'
        : 'image/jpeg'
    return { mimeType: mime, fileType: 'image' }
  }

  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
    const mime = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4'
    return { mimeType: mime, fileType: 'video' }
  }

  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) {
    const mime = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg'
    return { mimeType: mime, fileType: 'audio' }
  }

  if (['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.html', '.css'].includes(ext)) {
    return { mimeType: 'text/plain', fileType: 'script' }
  }

  if (['.pdf', '.doc', '.docx', '.csv'].includes(ext)) {
    const mime = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream'
    return { mimeType: mime, fileType: 'document' }
  }

  return { mimeType: 'application/octet-stream', fileType: 'other' }
}
