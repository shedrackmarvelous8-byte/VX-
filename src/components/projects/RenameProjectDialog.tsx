'use client'

import React, { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import '../auth/AuthSheet.css'

interface RenameProjectDialogProps {
  open: boolean
  currentName: string
  onClose: () => void
  onRename: (newName: string) => Promise<{ success: boolean; error?: string }>
}

export function RenameProjectDialog({ open, currentName, onClose, onRename }: RenameProjectDialogProps) {
  const [name, setName] = useState(currentName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setLoading(true)
    const res = await onRename(name.trim())
    setLoading(false)
    if (res.success) {
      onClose()
    } else {
      setError(res.error || 'Failed to rename project')
    }
  }

  const handleClose = () => {
    setError(null)
    setName(currentName)
    onClose()
  }

  return (
    <Sheet open={open} title="Rename Project" onClose={handleClose}>
      <div className="auth-sheet">
        {error && (
          <div className="auth-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="rename-project-input">
              Project Name
            </label>
            <div className="auth-input-wrap">
              <Icon name="folder" size={16} className="auth-input-icon" />
              <input
                id="rename-project-input"
                type="text"
                required
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="auth-actions" style={{ flexDirection: 'row', marginTop: 'var(--s-4)' }}>
            <button
              type="button"
              className="confirm__btn"
              style={{ flex: 1 }}
              onClick={handleClose}
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
              {loading ? 'Saving...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </Sheet>
  )
}
