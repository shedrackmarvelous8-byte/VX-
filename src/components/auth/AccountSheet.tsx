'use client'

import React, { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'
import './AuthSheet.css'

interface AccountSheetProps {
  open: boolean
  onClose: () => void
  onOpenVerification?: () => void
}

export function AccountSheet({ open, onClose, onOpenVerification }: AccountSheetProps) {
  const { user, isVerified, logout, updateProfile, resendVerificationCode } = useAuth()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)

  if (!user) return null

  const initial = (user.display_name?.[0] || user.email[0] || 'U').toUpperCase()

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)
    const res = await updateProfile({ displayName })
    setLoading(false)
    if (res.success) {
      setSuccessMsg('Profile updated successfully')
      setEditing(false)
    } else {
      setError(res.error || 'Failed to update profile')
    }
  }

  const handleResendAndVerify = async () => {
    setError(null)
    setSuccessMsg(null)
    setResendLoading(true)
    const res = await resendVerificationCode()
    setResendLoading(false)
    if (res.success) {
      setSuccessMsg(res.message || 'Verification code sent to your email.')
      if (onOpenVerification) {
        onClose()
        onOpenVerification()
      }
    } else {
      setError(res.error || 'Failed to send verification code')
    }
  }

  const handleLogout = async () => {
    await logout()
    onClose()
  }

  const formattedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Recently'

  return (
    <Sheet open={open} title="Account Settings" onClose={onClose}>
      <div className="auth-sheet">
        <div className="account-profile-card">
          <div className="account-avatar-large" aria-hidden="true">
            {initial}
          </div>
          <div className="account-profile-info">
            <span className="account-display-name">
              {user.display_name || user.email.split('@')[0]}
            </span>
            <span className="account-email">{user.email}</span>
          </div>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-success" role="status">
            <Icon name="check" size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {editing ? (
          <form className="auth-form" onSubmit={handleUpdate}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="edit-display-name">
                Display Name
              </label>
              <div className="auth-input-wrap">
                <Icon name="user" size={16} className="auth-input-icon" />
                <input
                  id="edit-display-name"
                  type="text"
                  required
                  className="auth-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
            <div className="auth-actions" style={{ flexDirection: 'row' }}>
              <button
                type="button"
                className="confirm__btn"
                style={{ flex: 1 }}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="confirm__btn confirm__btn--primary"
                style={{ flex: 1 }}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="account-meta-row">
              <span className="account-meta-label">Email Status</span>
              <span className="account-meta-val">
                {isVerified ? (
                  <span className="account-badge-verified">
                    <Icon name="check" size={12} />
                    Verified
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="account-badge-unverified">
                      <Icon name="alert" size={12} />
                      Unverified
                    </span>
                    <button
                      type="button"
                      className="auth-link-btn"
                      style={{ padding: '0 4px', fontSize: '13px' }}
                      onClick={handleResendAndVerify}
                      disabled={resendLoading}
                    >
                      {resendLoading ? 'Sending...' : 'Verify now'}
                    </button>
                  </div>
                )}
              </span>
            </div>

            <div className="account-meta-row">
              <span className="account-meta-label">Display Name</span>
              <span className="account-meta-val">
                {user.display_name || 'Not set'}{' '}
                <button
                  type="button"
                  className="auth-link-btn"
                  style={{ display: 'inline', padding: '0 4px', fontSize: '13px' }}
                  onClick={() => {
                    setDisplayName(user.display_name || '')
                    setEditing(true)
                  }}
                >
                  Edit
                </button>
              </span>
            </div>

            <div className="account-meta-row">
              <span className="account-meta-label">Account ID</span>
              <span className="account-meta-val" style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {user.id.slice(0, 8)}...{user.id.slice(-4)}
              </span>
            </div>

            <div className="account-meta-row">
              <span className="account-meta-label">Member Since</span>
              <span className="account-meta-val">{formattedDate}</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'var(--s-4)' }}>
          <button type="button" className="account-logout-btn" onClick={handleLogout}>
            <Icon name="logOut" size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </Sheet>
  )
}
