'use client'

import React, { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import '../auth/AuthSheet.css'

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (
    name: string,
    stack: string,
    description?: string,
    target?: 'web' | 'mobile' | 'web_mobile'
  ) => Promise<{ success: boolean; error?: string }>
}

const TARGETS: Array<{ id: 'web' | 'mobile' | 'web_mobile'; label: string; desc: string }> = [
  { id: 'web', label: 'Web', desc: 'Next.js web application deployed to Vercel' },
  { id: 'mobile', label: 'Mobile', desc: 'Expo & React Native mobile application' },
  { id: 'web_mobile', label: 'Web + Mobile', desc: 'Combined Web application and Mobile app' },
]

const STACKS_BY_TARGET: Record<string, string[]> = {
  web: ['Next.js', 'React · Node', 'Go · Postgres', 'Python · FastAPI', 'Vue · Vite'],
  mobile: ['Expo · React Native', 'React Native CLI'],
  web_mobile: ['Next.js + Expo React Native', 'React · Node + Expo'],
}

export function NewProjectDialog({ open, onClose, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState<'web' | 'mobile' | 'web_mobile'>('web')
  const [stack, setStack] = useState('Next.js')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTargetChange = (newTarget: 'web' | 'mobile' | 'web_mobile') => {
    setTarget(newTarget)
    const availableStacks = STACKS_BY_TARGET[newTarget] || ['Next.js']
    setStack(availableStacks[0])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setLoading(true)
    const res = await onCreate(name.trim(), stack, description.trim() || undefined, target)
    setLoading(false)
    if (res.success) {
      setName('')
      setDescription('')
      setTarget('web')
      setStack('Next.js')
      onClose()
    } else {
      setError(res.error || 'Failed to create project')
    }
  }

  return (
    <Sheet open={open} title="Create New Project" onClose={onClose}>
      <div className="auth-sheet">
        {error && (
          <div className="auth-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Project Target</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTargetChange(t.id)}
                  style={{
                    background: target === t.id ? '#27272a' : '#18181c',
                    border: `1px solid ${target === t.id ? '#52525b' : '#27272a'}`,
                    borderRadius: '8px',
                    padding: '10px 8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: '10px', color: '#a1a1aa', lineHeight: 1.2 }}>
                    {t.id === 'web' ? 'Next.js Web' : t.id === 'mobile' ? 'Expo Mobile' : 'Web + Mobile'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="project-name">
              Project Name
            </label>
            <div className="auth-input-wrap">
              <Icon name="folder" size={16} className="auth-input-icon" />
              <input
                id="project-name"
                type="text"
                required
                placeholder="e.g. Apex Dashboard"
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="project-stack">
              Tech Stack
            </label>
            <div className="auth-input-wrap">
              <Icon name="code" size={16} className="auth-input-icon" />
              <select
                id="project-stack"
                className="auth-input"
                value={stack}
                onChange={(e) => setStack(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                {(STACKS_BY_TARGET[target] || ['Next.js']).map((s) => (
                  <option key={s} value={s} style={{ background: '#1c1c1f', color: '#fff' }}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="project-desc">
              Description (Optional)
            </label>
            <div className="auth-input-wrap">
              <Icon name="file" size={16} className="auth-input-icon" />
              <input
                id="project-desc"
                type="text"
                placeholder="Brief summary of your project"
                className="auth-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-actions" style={{ flexDirection: 'row', marginTop: 'var(--s-4)' }}>
            <button
              type="button"
              className="confirm__btn"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="confirm__btn confirm__btn--primary"
              style={{ flex: 1 }}
              disabled={loading || !name.trim()}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </Sheet>
  )
}
