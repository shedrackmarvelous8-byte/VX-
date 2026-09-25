import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { EnvironmentScope, EnvironmentVariableMeta } from '@/lib/env-vars/types'
import './environment.css'

interface EnvironmentSurfaceProps {
  projectId: string
  projectName?: string
}

export function EnvironmentSurface({ projectId }: EnvironmentSurfaceProps) {
  const [variables, setVariables] = useState<EnvironmentVariableMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newScope, setNewScope] = useState<EnvironmentScope>('all')
  const [newIsSecret, setNewIsSecret] = useState(true)

  const [editVar, setEditVar] = useState<EnvironmentVariableMeta | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editScope, setEditScope] = useState<EnvironmentScope>('all')
  const [editIsSecret, setEditIsSecret] = useState(true)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const fetchVariables = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/environment`)
      if (res.ok) {
        const data = await res.json()
        setVariables(data.variables || [])
      }
    } catch {
      // Ignore background network error
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchVariables(false)
  }, [fetchVariables])

  const handleReveal = async (variableId: string) => {
    if (revealedSecrets[variableId]) {
      // Toggle off
      setRevealedSecrets((prev) => {
        const copy = { ...prev }
        delete copy[variableId]
        return copy
      })
      return
    }

    try {
      const res = await authFetch(`/api/projects/${projectId}/environment/${variableId}/reveal`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setRevealedSecrets((prev) => ({ ...prev, [variableId]: data.secret }))
      }
    } catch (err) {
      console.error('Failed to reveal secret:', err)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKey.trim()) return
    try {
      const res = await authFetch(`/api/projects/${projectId}/environment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue,
          scope: newScope,
          isSecret: newIsSecret,
        }),
      })
      if (res.ok) {
        setShowAddModal(false)
        setNewKey('')
        setNewValue('')
        fetchVariables()
      }
    } catch (err) {
      console.error('Failed to add variable:', err)
    }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editVar) return
    try {
      const res = await authFetch(`/api/projects/${projectId}/environment/${editVar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: editValue || undefined,
          scope: editScope,
          isSecret: editIsSecret,
        }),
      })
      if (res.ok) {
        setEditVar(null)
        setEditValue('')
        fetchVariables()
      }
    } catch (err) {
      console.error('Failed to update variable:', err)
    }
  }

  const handleDelete = async (variableId: string) => {
    try {
      const res = await authFetch(`/api/projects/${projectId}/environment/${variableId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setConfirmDeleteId(null)
        fetchVariables()
      }
    } catch (err) {
      console.error('Failed to delete variable:', err)
    }
  }

  return (
    <div className="env-container">
      {/* Toolbar */}
      <div className="env-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Environment Variables</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            ({variables.length} configured)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className="env-btn env-btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Variable
          </button>
          <button className="env-btn env-btn-secondary" onClick={() => fetchVariables(true)} title="Refresh">
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="env-banner">
        <Icon name="lock" size={14} />
        <span>
          Secrets are encrypted using AES-256-GCM. Sandbox commands and builds automatically redact
          sensitive values.
        </span>
      </div>

      {/* Variables List */}
      <div className="env-list">
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Loading variables...
          </div>
        ) : variables.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            <p>No environment variables configured for this project.</p>
            <p style={{ fontSize: 11, opacity: 0.7 }}>
              Add variables like API keys, database credentials, or environment flags.
            </p>
          </div>
        ) : (
          variables.map((v) => {
            const isRevealed = Boolean(revealedSecrets[v.id])
            const displayVal = isRevealed ? revealedSecrets[v.id] : v.maskedValue

            return (
              <div key={v.id} className="env-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa' }}>{v.key}</code>
                    <span className="env-scope-badge">{v.scope}</span>
                    {v.isSecret && (
                      <span className="env-secret-badge">
                        <Icon name="lock" size={10} /> Secret
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="env-btn env-btn-secondary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => handleCopy(v.key, `key-${v.id}`)}
                    >
                      {copiedKey === `key-${v.id}` ? 'Copied' : 'Copy Key'}
                    </button>
                    <button
                      className="env-btn env-btn-secondary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => {
                        setEditVar(v)
                        setEditScope(v.scope)
                        setEditIsSecret(v.isSecret)
                        setEditValue('')
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="env-btn env-btn-danger"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => setConfirmDeleteId(v.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0,0,0,0.25)',
                    padding: '6px 10px',
                    borderRadius: 6,
                    marginTop: 4,
                  }}
                >
                  <code style={{ fontSize: 12, opacity: 0.85, wordBreak: 'break-all' }}>
                    {displayVal}
                  </code>

                  {v.isSecret && (
                    <div style={{ display: 'flex', gap: 6, marginLeft: 8, flexShrink: 0 }}>
                      <button
                        className="env-btn env-btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 10 }}
                        onClick={() => handleReveal(v.id)}
                      >
                        {isRevealed ? 'Hide' : 'Reveal'}
                      </button>
                      {isRevealed && (
                        <button
                          className="env-btn env-btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 10 }}
                          onClick={() => handleCopy(displayVal, `val-${v.id}`)}
                        >
                          {copiedKey === `val-${v.id}` ? 'Copied' : 'Copy Value'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="env-modal-overlay">
          <div className="env-modal">
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Add Environment Variable</h4>
            <form onSubmit={handleAdd}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Variable Name (KEY)</label>
              <input
                type="text"
                placeholder="e.g. DATABASE_URL, STRIPE_SECRET_KEY"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                className="env-input"
                autoFocus
                required
              />

              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 10 }}>
                Value
              </label>
              <input
                type="text"
                placeholder="Enter value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="env-input"
                required
              />

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target Scope</label>
                  <select
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value as EnvironmentScope)}
                    className="env-input"
                  >
                    <option value="all">All Environments</option>
                    <option value="development">Development Only</option>
                    <option value="preview">Preview Only</option>
                    <option value="production">Production Only</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <input
                  type="checkbox"
                  id="secret-check"
                  checked={newIsSecret}
                  onChange={(e) => setNewIsSecret(e.target.checked)}
                />
                <label htmlFor="secret-check" style={{ fontSize: 12, cursor: 'pointer' }}>
                  Encrypt as Sensitive Secret (AES-256-GCM)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="env-btn env-btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="env-btn env-btn-primary">
                  Save Variable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editVar && (
        <div className="env-modal-overlay">
          <div className="env-modal">
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Edit {editVar.key}</h4>
            <form onSubmit={handleEdit}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                New Value (Leave blank to keep existing)
              </label>
              <input
                type="text"
                placeholder="Enter new value"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="env-input"
              />

              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 10 }}>
                Target Scope
              </label>
              <select
                value={editScope}
                onChange={(e) => setEditScope(e.target.value as EnvironmentScope)}
                className="env-input"
              >
                <option value="all">All Environments</option>
                <option value="development">Development Only</option>
                <option value="preview">Preview Only</option>
                <option value="production">Production Only</option>
              </select>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <input
                  type="checkbox"
                  id="edit-secret-check"
                  checked={editIsSecret}
                  onChange={(e) => setEditIsSecret(e.target.checked)}
                />
                <label htmlFor="edit-secret-check" style={{ fontSize: 12, cursor: 'pointer' }}>
                  Encrypt as Sensitive Secret
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="env-btn env-btn-secondary"
                  onClick={() => setEditVar(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="env-btn env-btn-primary">
                  Update Variable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDeleteId && (
        <div className="env-modal-overlay">
          <div className="env-modal">
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#ef4444' }}>
              Confirm Deletion
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Are you sure you want to delete this environment variable? Applications depending on
              it may experience runtime errors.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                className="env-btn env-btn-secondary"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="env-btn env-btn-danger"
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
