/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { GenerationJob, GenerationType, ProjectMedia } from '@/lib/db/types'
import type { DiscoveredModel } from '@/lib/ai/discovery'
import './studio.css'

interface CreationStudioSurfaceProps {
  projectId: string
  projectName?: string
}

type MainTab = 'create' | 'library' | 'jobs' | 'storage'
type CreateCategory = 'image' | 'script' | 'video' | 'audio' | 'upload'

export function CreationStudioSurface({ projectId, projectName }: CreationStudioSurfaceProps) {
  const [mainTab, setMainTab] = useState<MainTab>('create')
  const [createCategory, setCreateCategory] = useState<CreateCategory>('image')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Media Library state
  const [mediaList, setMediaList] = useState<ProjectMedia[]>([])
  const [mediaFilter, setMediaFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<ProjectMedia | null>(null)

  // Creation Form State
  const [models, setModels] = useState<DiscoveredModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:2'>('1:1')
  const [scriptFormat, setScriptFormat] = useState('YouTube Video Script')
  const [scriptTone, setScriptTone] = useState('Engaging & Professional')
  const [scriptLength, setScriptLength] = useState('Medium (~2-3 minutes)')
  const [videoDuration, setVideoDuration] = useState(5)
  const [audioVoice, setAudioVoice] = useState('Puck')

  // Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDisplayName, setUploadDisplayName] = useState('')
  const [isReferenceUpload, setIsReferenceUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Jobs and Storage State
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [storageStats, setStorageStats] = useState<{
    totalBytes: number
    fileCount: number
    quotaBytes: number
    byType: Record<string, { bytes: number; count: number }>
  } | null>(null)

  // Fetch Models for category
  const fetchCategoryModels = useCallback(async (cat: CreateCategory) => {
    if (cat === 'upload') return
    try {
      const res = await authFetch(`/api/projects/${projectId}/media/models?category=${cat}`)
      if (res.ok) {
        const data = await res.json()
        const modelList: DiscoveredModel[] = data.models || []
        setModels(modelList)
        if (modelList.length > 0 && !selectedModelId) {
          setSelectedModelId(modelList[0].id)
        }
      }
    } catch {
      // ignore
    }
  }, [projectId, selectedModelId])

  // Fetch Library, Jobs, and Stats
  const fetchMediaData = useCallback(async () => {
    try {
      setError(null)
      const [mediaRes, jobsRes, statsRes] = await Promise.all([
        authFetch(`/api/projects/${projectId}/media?fileType=${mediaFilter}&search=${encodeURIComponent(searchQuery)}`),
        authFetch(`/api/projects/${projectId}/media/jobs`),
        authFetch(`/api/projects/${projectId}/media/stats`),
      ])

      if (mediaRes.ok) {
        const mData = await mediaRes.json()
        setMediaList(mData.media || [])
      }

      if (jobsRes.ok) {
        const jData = await jobsRes.json()
        setJobs(jData.jobs || [])
      }

      if (statsRes.ok) {
        const sData = await statsRes.json()
        setStorageStats(sData.stats || null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch media data')
    } finally {
      setLoading(false)
    }
  }, [projectId, mediaFilter, searchQuery])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMediaData()
  }, [fetchMediaData])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCategoryModels(createCategory)
  }, [createCategory, fetchCategoryModels])

  // Poll for active jobs
  useEffect(() => {
    const hasActiveJob = jobs.some((j) => j.status === 'queued' || j.status === 'running' || j.status === 'processing')
    if (!hasActiveJob) return

    const timer = setInterval(() => {
      fetchMediaData()
    }, 3000)

    return () => clearInterval(timer)
  }, [jobs, fetchMediaData])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() && createCategory !== 'upload') return

    setGenerating(true)
    setError(null)
    setFeedback(null)

    try {
      if (createCategory === 'video') {
        const res = await authFetch(`/api/projects/${projectId}/media/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt.trim(),
            modelId: selectedModelId,
            duration: videoDuration,
            aspectRatio,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to queue video generation')
        setPrompt('')
        setMainTab('jobs')
        await fetchMediaData()
        return
      }

      const res = await authFetch(`/api/projects/${projectId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: createCategory,
          prompt: prompt.trim(),
          modelId: selectedModelId,
          aspectRatio,
          format: scriptFormat,
          tone: scriptTone,
          length: scriptLength,
          voice: audioVoice,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      setPrompt('')
      setSelectedMedia(data.media)
      setFeedback(`Asset "${data.media.display_name}" created successfully!`)
      await fetchMediaData()
    } catch (err: any) {
      setError(err.message || 'Generation error')
    } finally {
      setGenerating(false)
    }
  }

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    setGenerating(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (uploadDisplayName) formData.append('displayName', uploadDisplayName)
      formData.append('isReference', isReferenceUpload ? 'true' : 'false')

      const res = await authFetch(`/api/projects/${projectId}/media`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setUploadFile(null)
      setUploadDisplayName('')
      setSelectedMedia(data.media)
      setFeedback(`File "${data.media.display_name}" uploaded to project media!`)
      await fetchMediaData()
    } catch (err: any) {
      setError(err.message || 'Upload error')
    } finally {
      setGenerating(false)
    }
  }

  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm('Permanently delete this media asset from project?')) return
    try {
      const res = await authFetch(`/api/projects/${projectId}/media/${mediaId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        if (selectedMedia?.id === mediaId) setSelectedMedia(null)
        await fetchMediaData()
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleRegenerate = async (media: ProjectMedia) => {
    setGenerating(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/media/${media.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: media.prompt,
          modelId: media.model_id,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSelectedMedia(data.media)
        setFeedback(`Regenerated new version (v${data.media.version || 2})!`)
        await fetchMediaData()
      } else {
        alert(data.error || 'Regeneration failed')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const copyAssetRef = (media: ProjectMedia) => {
    const ref = media.public_url || `/api/projects/${projectId}/media/${media.id}/content`
    navigator.clipboard.writeText(ref)
    setFeedback('Project asset reference URL copied!')
    setTimeout(() => setFeedback(null), 2500)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <div className="studio-container">
      {/* Top Toolbar */}
      <div className="studio-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="studio-badge">
            <Icon name="wand" size={13} />
            AI Creation Studio
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {projectName || 'Current Project'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {storageStats && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Storage: {formatBytes(storageStats.totalBytes)} / {formatBytes(storageStats.quotaBytes)}
            </span>
          )}
          <button
            className="studio-btn studio-btn-secondary"
            onClick={() => fetchMediaData()}
            title="Refresh Media"
          >
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>

      {/* Main Navigation Pills */}
      <div className="studio-nav-pills">
        <button
          className={`studio-pill ${mainTab === 'create' ? 'active' : ''}`}
          onClick={() => setMainTab('create')}
        >
          <Icon name="wand" size={14} />
          Studio (Create)
        </button>
        <button
          className={`studio-pill ${mainTab === 'library' ? 'active' : ''}`}
          onClick={() => setMainTab('library')}
        >
          <Icon name="folder" size={14} />
          Media Library ({mediaList.length})
        </button>
        <button
          className={`studio-pill ${mainTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setMainTab('jobs')}
        >
          <Icon name="play" size={14} />
          Generation Jobs {jobs.some((j) => j.status === 'processing') ? '●' : ''}
        </button>
        <button
          className={`studio-pill ${mainTab === 'storage' ? 'active' : ''}`}
          onClick={() => setMainTab('storage')}
        >
          <Icon name="database" size={14} />
          Storage & Quotas
        </button>
      </div>

      {/* Main Content Area */}
      <div className="studio-content">
        {feedback && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              color: '#4ade80',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{feedback}</span>
            <button
              onClick={() => setFeedback(null)}
              style={{ background: 'transparent', border: 'none', color: '#4ade80', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        )}

        {/* TAB 1: STUDIO (CREATE) */}
        {mainTab === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Category Selector */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button
                className={`studio-pill ${createCategory === 'image' ? 'active' : ''}`}
                onClick={() => setCreateCategory('image')}
              >
                <Icon name="image" size={14} />
                Image
              </button>
              <button
                className={`studio-pill ${createCategory === 'script' ? 'active' : ''}`}
                onClick={() => setCreateCategory('script')}
              >
                <Icon name="file" size={14} />
                Script / Copy
              </button>
              <button
                className={`studio-pill ${createCategory === 'video' ? 'active' : ''}`}
                onClick={() => setCreateCategory('video')}
              >
                <Icon name="video" size={14} />
                Video
              </button>
              <button
                className={`studio-pill ${createCategory === 'audio' ? 'active' : ''}`}
                onClick={() => setCreateCategory('audio')}
              >
                <Icon name="music" size={14} />
                Audio / Voice
              </button>
              <button
                className={`studio-pill ${createCategory === 'upload' ? 'active' : ''}`}
                onClick={() => setCreateCategory('upload')}
              >
                <Icon name="paperclip" size={14} />
                Upload Media
              </button>
            </div>

            {/* Creation Form */}
            {createCategory !== 'upload' ? (
              <form onSubmit={handleGenerate} className="studio-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    Create {createCategory.charAt(0).toUpperCase() + createCategory.slice(1)}
                  </span>

                  {models.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Model:</span>
                      <select
                        className="studio-select"
                        value={selectedModelId}
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                      >
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="studio-form-group">
                  <label className="studio-label">
                    {createCategory === 'script' ? 'Script Brief & Concept' : 'Generation Prompt'}
                  </label>
                  <textarea
                    className="studio-textarea"
                    rows={createCategory === 'script' ? 4 : 3}
                    placeholder={
                      createCategory === 'image'
                        ? 'e.g. Luxurious dark-themed barbershop hero photograph with warm ambient lighting...'
                        : createCategory === 'script'
                        ? 'e.g. Explain our Next.js web application architecture to new clients in an engaging story...'
                        : createCategory === 'video'
                        ? 'e.g. Cinematic slow pan of modern software workspace dashboard on a clean desk...'
                        : 'e.g. Welcome to the future of development. VX combines artificial intelligence and real cloud engineering.'
                    }
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </div>

                {/* Aspect Ratio for Image & Video */}
                {(createCategory === 'image' || createCategory === 'video') && (
                  <div className="studio-form-group">
                    <label className="studio-label">Aspect Ratio</label>
                    <div className="studio-aspect-pills">
                      {(['1:1', '16:9', '9:16', '4:3', '3:2'] as const).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          className={`studio-aspect-btn ${aspectRatio === ratio ? 'active' : ''}`}
                          onClick={() => setAspectRatio(ratio)}
                        >
                          {ratio} {ratio === '1:1' ? '(Square)' : ratio === '16:9' ? '(Landscape)' : ratio === '9:16' ? '(Portrait)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Script Parameters */}
                {createCategory === 'script' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div className="studio-form-group">
                      <label className="studio-label">Format</label>
                      <select
                        className="studio-select"
                        value={scriptFormat}
                        onChange={(e) => setScriptFormat(e.target.value)}
                      >
                        <option value="YouTube Video Script">YouTube Video Script</option>
                        <option value="Commercial Advertisement">Commercial Advertisement</option>
                        <option value="Short Film / Narrative">Short Film / Narrative</option>
                        <option value="Documentary Voice-Over">Documentary Voice-Over</option>
                        <option value="Website Headline & Copy">Website Headline & Copy</option>
                        <option value="Social Media Reel">Social Media Reel</option>
                      </select>
                    </div>

                    <div className="studio-form-group">
                      <label className="studio-label">Tone</label>
                      <input
                        type="text"
                        className="studio-input"
                        value={scriptTone}
                        onChange={(e) => setScriptTone(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Video Duration */}
                {createCategory === 'video' && (
                  <div className="studio-form-group">
                    <label className="studio-label">Target Duration</label>
                    <div className="studio-aspect-pills">
                      {[3, 5, 10].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`studio-aspect-btn ${videoDuration === d ? 'active' : ''}`}
                          onClick={() => setVideoDuration(d)}
                        >
                          {d} Seconds
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audio Voice */}
                {createCategory === 'audio' && (
                  <div className="studio-form-group">
                    <label className="studio-label">Voice Selection</label>
                    <select
                      className="studio-select"
                      value={audioVoice}
                      onChange={(e) => setAudioVoice(e.target.value)}
                    >
                      <option value="Puck">Puck (Natural Male)</option>
                      <option value="Charon">Charon (Deep Male)</option>
                      <option value="Kore">Kore (Warm Female)</option>
                      <option value="Fenrir">Fenrir (Authoritative Male)</option>
                      <option value="Aoede">Aoede (Expressive Female)</option>
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="studio-btn studio-btn-primary"
                    disabled={generating || !prompt.trim()}
                  >
                    <Icon name="wand" size={14} />
                    {generating ? 'Generating Media...' : `Generate ${createCategory.charAt(0).toUpperCase() + createCategory.slice(1)}`}
                  </button>
                </div>
              </form>
            ) : (
              /* Upload Form */
              <form onSubmit={handleFileUpload} className="studio-card">
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Upload Media Asset</div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Upload image, video, audio, or document files directly to your project media vault with Supabase Storage persistence.
                </p>

                <div
                  style={{
                    border: '2px dashed rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'var(--bg-surface)',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="paperclip" size={24} style={{ margin: '0 auto 8px auto', display: 'block', color: 'var(--text-muted)' }} />
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {uploadFile ? uploadFile.name : 'Click to select or drop a file'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Images (up to 25MB), Videos (up to 200MB), Audio (up to 50MB)
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setUploadFile(e.target.files[0])
                        setUploadDisplayName(e.target.files[0].name)
                      }
                    }}
                  />
                </div>

                {uploadFile && (
                  <>
                    <div className="studio-form-group">
                      <label className="studio-label">Display Name</label>
                      <input
                        type="text"
                        className="studio-input"
                        value={uploadDisplayName}
                        onChange={(e) => setUploadDisplayName(e.target.value)}
                      />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isReferenceUpload}
                        onChange={(e) => setIsReferenceUpload(e.target.checked)}
                      />
                      <span>Mark as Reference Asset for AI Studio generation</span>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        type="button"
                        className="studio-btn studio-btn-secondary"
                        onClick={() => setUploadFile(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="studio-btn studio-btn-primary"
                        disabled={generating}
                      >
                        {generating ? 'Uploading...' : 'Save to Project Media'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        )}

        {/* TAB 2: MEDIA LIBRARY */}
        {mainTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                {(['all', 'image', 'video', 'audio', 'script', 'document'] as const).map((f) => (
                  <button
                    key={f}
                    className={`studio-aspect-btn ${mediaFilter === f ? 'active' : ''}`}
                    onClick={() => setMediaFilter(f)}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Search media..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="studio-input"
                style={{ width: '180px', padding: '4px 8px', fontSize: '11px' }}
              />
            </div>

            {/* Media Gallery Grid */}
            {mediaList.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No media assets found in this project. Use the Studio (Create) tab to generate or upload images, videos, scripts, and audio.
              </div>
            ) : (
              <div className="studio-grid">
                {mediaList.map((m) => (
                  <div
                    key={m.id}
                    className="studio-media-card"
                    onClick={() => setSelectedMedia(m)}
                  >
                    <div className="studio-media-thumb">
                      {m.file_type === 'image' ? (
                        <img
                          src={m.public_url || `/api/projects/${projectId}/media/${m.id}/content`}
                          alt={m.display_name}
                          loading="lazy"
                        />
                      ) : m.file_type === 'video' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#60a5fa' }}>
                          <Icon name="video" size={24} />
                          <span style={{ fontSize: '10px' }}>Video Asset</span>
                        </div>
                      ) : m.file_type === 'audio' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#c084fc' }}>
                          <Icon name="music" size={24} />
                          <span style={{ fontSize: '10px' }}>Audio Track</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                          <Icon name="file" size={24} />
                          <span style={{ fontSize: '10px' }}>Script Document</span>
                        </div>
                      )}

                      {m.version && m.version > 1 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            background: 'rgba(0,0,0,0.7)',
                            color: '#93c5fd',
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          v{m.version}
                        </span>
                      )}
                    </div>

                    <div className="studio-media-info">
                      <div className="studio-media-name">{m.display_name || m.file_name}</div>
                      <div className="studio-media-meta">
                        <span style={{ textTransform: 'capitalize' }}>{m.file_type}</span>
                        <span>{formatBytes(m.size_bytes)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GENERATION JOBS */}
        {mainTab === 'jobs' && (
          <div className="studio-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '13px' }}>Asynchronous Generation Jobs</strong>
              <span className="studio-badge">{jobs.length} Tracked</span>
            </div>

            {jobs.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active or historical generation jobs recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' }}>
                        {job.type} Generation Job
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color:
                            job.status === 'completed'
                              ? '#4ade80'
                              : job.status === 'failed'
                              ? '#f87171'
                              : '#38bdf8',
                        }}
                      >
                        {job.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{job.prompt}</div>
                    {job.status === 'processing' && (
                      <div className="studio-progress-bar">
                        <div className="studio-progress-fill" style={{ width: `${job.progress || 40}%` }} />
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: '#71717a' }}>
                      Created at {new Date(job.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: STORAGE & QUOTAS */}
        {mainTab === 'storage' && (
          <div className="studio-card">
            <strong style={{ fontSize: '13px' }}>Supabase Storage & Project Quota</strong>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Media binaries are isolated by project in Supabase Storage with signed URL protection and safe asset linking.
            </p>

            {storageStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span>Project Storage Usage</span>
                    <strong>
                      {formatBytes(storageStats.totalBytes)} of {formatBytes(storageStats.quotaBytes)} (
                      {((storageStats.totalBytes / storageStats.quotaBytes) * 100).toFixed(1)}%)
                    </strong>
                  </div>
                  <div className="studio-progress-bar" style={{ height: '8px' }}>
                    <div
                      className="studio-progress-fill"
                      style={{
                        width: `${Math.min(100, (storageStats.totalBytes / storageStats.quotaBytes) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {Object.entries(storageStats.byType).map(([type, stat]) => (
                    <div
                      key={type}
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{type}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{formatBytes(stat.bytes)}</div>
                      <div style={{ fontSize: '10px', color: '#71717a' }}>{stat.count} assets</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MEDIA PREVIEW MODAL */}
      {selectedMedia && (
        <div className="studio-modal-backdrop" onClick={() => setSelectedMedia(null)}>
          <div className="studio-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '14px' }}>{selectedMedia.display_name}</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selectedMedia.file_type.toUpperCase()} • {formatBytes(selectedMedia.size_bytes)} • Created {new Date(selectedMedia.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => setSelectedMedia(null)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* Media Rendering */}
            <div style={{ background: '#09090b', borderRadius: '8px', overflow: 'hidden', textAlign: 'center', padding: '12px' }}>
              {selectedMedia.file_type === 'image' && (
                <img
                  src={selectedMedia.public_url || `/api/projects/${projectId}/media/${selectedMedia.id}/content`}
                  alt={selectedMedia.display_name}
                  style={{ maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', margin: '0 auto' }}
                />
              )}

              {selectedMedia.file_type === 'video' && (
                <video
                  controls
                  src={selectedMedia.public_url || `/api/projects/${projectId}/media/${selectedMedia.id}/content`}
                  style={{ maxWidth: '100%', maxHeight: '360px' }}
                />
              )}

              {selectedMedia.file_type === 'audio' && (
                <audio
                  controls
                  src={selectedMedia.public_url || `/api/projects/${projectId}/media/${selectedMedia.id}/content`}
                  style={{ width: '100%', marginTop: '12px' }}
                />
              )}

              {selectedMedia.file_type === 'script' && (
                <pre
                  style={{
                    textAlign: 'left',
                    fontSize: '12px',
                    color: '#d4d4d8',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    padding: '8px',
                  }}
                >
                  {selectedMedia.metadata?.rawScript || 'Script content recorded.'}
                </pre>
              )}
            </div>

            {selectedMedia.prompt && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                <strong>Prompt: </strong> {selectedMedia.prompt}
              </div>
            )}

            {/* Actions Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="studio-btn studio-btn-secondary"
                  onClick={() => copyAssetRef(selectedMedia)}
                >
                  <Icon name="copy" size={13} />
                  Copy Asset Reference
                </button>

                <a
                  href={selectedMedia.public_url || `/api/projects/${projectId}/media/${selectedMedia.id}/content`}
                  download={selectedMedia.file_name}
                  className="studio-btn studio-btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  <Icon name="arrowDown" size={13} />
                  Download
                </a>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="studio-btn studio-btn-primary"
                  onClick={() => handleRegenerate(selectedMedia)}
                  disabled={generating}
                >
                  <Icon name="wand" size={13} />
                  Regenerate
                </button>

                <button
                  className="studio-btn studio-btn-danger"
                  onClick={() => handleDeleteMedia(selectedMedia.id)}
                >
                  <Icon name="trash" size={13} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
