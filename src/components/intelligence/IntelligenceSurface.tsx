import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { ProjectNote, ProjectReview } from '@/lib/db/types'
import './intelligence.css'

interface IntelligenceSurfaceProps {
  projectId: string
  projectName?: string
}

type IntelTab = 'notes' | 'review' | 'docs'

export function IntelligenceSurface({ projectId, projectName }: IntelligenceSurfaceProps) {
  const [activeTab, setActiveTab] = useState<IntelTab>('notes')
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [review, setReview] = useState<ProjectReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [showAddNote, setShowAddNote] = useState(false)
  const [selectedNote, setSelectedNote] = useState<ProjectNote | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [notesRes, reviewRes] = await Promise.all([
        authFetch(`/api/projects/${projectId}/notes`),
        authFetch(`/api/projects/${projectId}/review`),
      ])

      if (notesRes.ok) {
        const nData = await notesRes.json()
        setNotes(nData.notes || [])
      }

      if (reviewRes.ok) {
        const rData = await reviewRes.json()
        setReview(rData.review || null)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData()
  }, [fetchData])

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteTitle.trim()) return

    try {
      const res = await authFetch(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle.trim(),
          content: newNoteContent,
          category: 'project_notes',
        }),
      })
      if (res.ok) {
        setNewNoteTitle('')
        setNewNoteContent('')
        setShowAddNote(false)
        fetchData()
      }
    } catch {
      // ignore
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this project note?')) return
    try {
      const res = await authFetch(`/api/projects/${projectId}/notes/${noteId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        if (selectedNote?.id === noteId) setSelectedNote(null)
        fetchData()
      }
    } catch {
      // ignore
    }
  }

  const handleRunReview = async () => {
    setReviewing(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'full' }),
      })
      if (res.ok) {
        const data = await res.json()
        setReview(data.review)
        setActiveTab('review')
      }
    } catch {
      // ignore
    } finally {
      setReviewing(false)
    }
  }

  const handleGenerateDoc = async (docType: string) => {
    try {
      const res = await authFetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType }),
      })
      if (res.ok) {
        fetchData()
        setActiveTab('notes')
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="intel-container">
      {/* Top Toolbar */}
      <div className="intel-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="intel-badge">
            <Icon name="code" size={13} />
            Work Intelligence
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {projectName || 'Current Project'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="intel-btn intel-btn-secondary"
            onClick={handleRunReview}
            disabled={reviewing}
          >
            <Icon name="checkCircle" size={13} />
            {reviewing ? 'Auditing...' : 'Run Project Review'}
          </button>
        </div>
      </div>

      {/* Nav Pills */}
      <div className="intel-nav-pills">
        <button
          className={`intel-pill ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          <Icon name="folder" size={13} />
          Project Notes ({notes.length})
        </button>
        <button
          className={`intel-pill ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          <Icon name="check" size={13} />
          Project Review {review?.findings ? `(${review.findings.length})` : ''}
        </button>
        <button
          className={`intel-pill ${activeTab === 'docs' ? 'active' : ''}`}
          onClick={() => setActiveTab('docs')}
        >
          <Icon name="externalLink" size={13} />
          Generate Documents
        </button>
      </div>

      {/* Content Area */}
      <div className="intel-content">
        {activeTab === 'notes' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Recorded Decisions & Notes</span>
              <button
                className="intel-btn intel-btn-primary"
                onClick={() => setShowAddNote(!showAddNote)}
              >
                + Add Note
              </button>
            </div>

            {showAddNote && (
              <form onSubmit={handleCreateNote} className="intel-card">
                <input
                  type="text"
                  placeholder="Note Title (e.g. Authentication Strategy)"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <textarea
                  placeholder="Markdown note content..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows={4}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="intel-btn intel-btn-secondary"
                    onClick={() => setShowAddNote(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="intel-btn intel-btn-primary">
                    Save Note
                  </button>
                </div>
              </form>
            )}

            {notes.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No notes recorded yet. Discuss requirements or architecture in chat to generate structured notes.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notes.map((n) => (
                  <div key={n.id} className="intel-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px' }}>{n.title}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(n.updated_at).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                    </div>
                    <pre
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                        lineHeight: 1.5,
                      }}
                    >
                      {n.content}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'review' && (
          <>
            {review ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="intel-card">
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Audit Summary</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{review.summary}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {review.findings.map((f, i) => (
                    <div key={i} className="intel-finding-item">
                      <div className="intel-finding-header">
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{f.category}</span>
                        <span className={`intel-severity-badge ${f.severity}`}>{f.severity}</span>
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        <strong>Observation: </strong>
                        <span style={{ color: 'var(--text-muted)' }}>{f.observation}</span>
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        <strong>Recommendation: </strong>
                        <span style={{ color: '#93c5fd' }}>{f.recommendation}</span>
                      </div>
                      {f.action && (
                        <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                          <em>Action if approved: {f.action}</em>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No project review has been run yet. Click &quot;Run Project Review&quot; above to audit UI, security, accessibility, and code quality.
              </div>
            )}
          </>
        )}

        {activeTab === 'docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="intel-card">
              <strong style={{ fontSize: '13px' }}>Generate Structured Project Documents</strong>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Create clean, formatted specifications and briefs based on your current project files and architecture discussions.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                <button
                  className="intel-btn intel-btn-secondary"
                  onClick={() => handleGenerateDoc('project_brief')}
                >
                  Generate Project Brief
                </button>
                <button
                  className="intel-btn intel-btn-secondary"
                  onClick={() => handleGenerateDoc('requirements')}
                >
                  Generate Requirements Spec
                </button>
                <button
                  className="intel-btn intel-btn-secondary"
                  onClick={() => handleGenerateDoc('technical_spec')}
                >
                  Generate Technical Spec
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
