'use client'

import React, { useState, useEffect } from 'react'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { useAuth } from '../../hooks/useAuth'
import './AuthSheet.css'

interface AuthSheetProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialMode?: AuthMode
}

export type AuthMode = 'login' | 'signup' | 'verify' | 'reset-request' | 'reset-confirm'

export function AuthSheet({ open, onClose, onSuccess, initialMode = 'login' }: AuthSheetProps) {
  const {
    user,
    login,
    signup,
    verifyCode,
    resendVerificationCode,
    requestPasswordReset,
    confirmPasswordReset,
  } = useAuth()

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevInitialMode, setPrevInitialMode] = useState(initialMode)

  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  if (open !== prevOpen || initialMode !== prevInitialMode) {
    setPrevOpen(open)
    setPrevInitialMode(initialMode)
    if (open) {
      setMode(initialMode)
      if (user?.email && !email) {
        setEmail(user.email)
      }
    }
  }

  // Cooldown timer for resend verification
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  const resetForm = () => {
    setError(null)
    setSuccessMsg(null)
    setPassword('')
    setNewPassword('')
    setVerificationCode('')
  }

  const handleModeChange = (newMode: AuthMode) => {
    resetForm()
    setMode(newMode)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await login(email, password)
    setLoading(false)
    if (res.success) {
      handleClose()
      onSuccess?.()
    } else {
      setError(res.error || 'Login failed')
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await signup(email, password, displayName)
    setLoading(false)
    if (res.success) {
      if (res.requiresVerification) {
        setMode('verify')
        setCooldownSeconds(60)
        if (res.devCode) {
          setVerificationCode(res.devCode)
          setSuccessMsg(`Verification code sent to ${email} (Code: ${res.devCode})`)
        } else {
          setSuccessMsg(`We sent a 6-digit verification code to ${email}`)
        }
      } else {
        handleClose()
        onSuccess?.()
      }
    } else {
      setError(res.error || 'Signup failed')
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (verificationCode.trim().length !== 6) {
      setError('Please enter all 6 digits of your verification code')
      return
    }

    setLoading(true)
    const res = await verifyCode(verificationCode, email)
    setLoading(false)

    if (res.success) {
      setSuccessMsg('Email verified successfully! Opening workspace...')
      setTimeout(() => {
        handleClose()
        onSuccess?.()
      }, 900)
    } else {
      setError(res.error || 'Verification failed. Please check the code.')
    }
  }

  const handleResendCode = async () => {
    if (cooldownSeconds > 0 || loading) return
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    const res = await resendVerificationCode(email)
    setLoading(false)

    if (res.success) {
      setCooldownSeconds(res.cooldownSeconds || 60)
      if (res.devCode) {
        setVerificationCode(res.devCode)
        setSuccessMsg(res.message ? `${res.message} (Code: ${res.devCode})` : `New code sent (Code: ${res.devCode})`)
      } else {
        setSuccessMsg(res.message || `New verification code sent to ${email}`)
      }
    } else {
      if (res.cooldownSeconds) {
        setCooldownSeconds(res.cooldownSeconds)
      }
      setError(res.error || 'Failed to resend verification code')
    }
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)
    const res = await requestPasswordReset(email)
    setLoading(false)
    if (res.success) {
      setSuccessMsg(res.message || 'Password reset instructions have been sent to your email.')
      if (res.devResetToken) {
        setResetToken(res.devResetToken)
        setMode('reset-confirm')
      }
    } else {
      setError(res.error || 'Failed to submit reset request')
    }
  }

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)
    const res = await confirmPasswordReset(resetToken, newPassword)
    setLoading(false)
    if (res.success) {
      setSuccessMsg(res.message || 'Password updated successfully. Please log in.')
      setMode('login')
    } else {
      setError(res.error || 'Failed to reset password')
    }
  }

  const title =
    mode === 'login'
      ? 'Sign in to VX'
      : mode === 'signup'
      ? 'Create VX Account'
      : mode === 'verify'
      ? 'Verify Your Email'
      : mode === 'reset-request'
      ? 'Reset Password'
      : 'Set New Password'

  return (
    <Sheet open={open} title={title} onClose={handleClose}>
      <div className="auth-sheet">
        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className="auth-tab"
              data-active={mode === 'login' ? '' : undefined}
              onClick={() => handleModeChange('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className="auth-tab"
              data-active={mode === 'signup' ? '' : undefined}
              onClick={() => handleModeChange('signup')}
            >
              Sign Up
            </button>
          </div>
        )}

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

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-email">
                Email Address
              </label>
              <div className="auth-input-wrap">
                <Icon name="mail" size={16} className="auth-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-password">
                Password
              </label>
              <div className="auth-input-wrap">
                <Icon name="lock" size={16} className="auth-input-icon" />
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="auth-actions">
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleModeChange('reset-request')}
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {/* SIGNUP FORM */}
        {mode === 'signup' && (
          <form className="auth-form" onSubmit={handleSignup}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-name">
                Display Name (Optional)
              </label>
              <div className="auth-input-wrap">
                <Icon name="user" size={16} className="auth-input-icon" />
                <input
                  id="signup-name"
                  type="text"
                  placeholder="Alex Doe"
                  className="auth-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-email">
                Email Address
              </label>
              <div className="auth-input-wrap">
                <Icon name="mail" size={16} className="auth-input-icon" />
                <input
                  id="signup-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-password">
                Password (min. 8 characters)
              </label>
              <div className="auth-input-wrap">
                <Icon name="lock" size={16} className="auth-input-icon" />
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="auth-actions">
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}

        {/* EMAIL VERIFICATION FORM */}
        {mode === 'verify' && (
          <form className="auth-form" onSubmit={handleVerify}>
            <div className="auth-instruction-box">
              <span>
                Please enter the <strong>6-digit verification code</strong> sent to:
              </span>
              <strong style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
                {email || 'your registered email'}
              </strong>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="verification-code">
                Verification Code
              </label>
              <input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                className="auth-verification-input"
                value={verificationCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setVerificationCode(val)
                }}
                autoComplete="one-time-code"
              />
            </div>

            <div className="auth-resend-row">
              <span>Didn&apos;t receive the code?</span>
              <button
                type="button"
                className="auth-link-btn"
                style={{ padding: '2px 4px' }}
                disabled={cooldownSeconds > 0 || loading}
                onClick={handleResendCode}
              >
                {cooldownSeconds > 0 ? `Resend code (${cooldownSeconds}s)` : 'Resend code'}
              </button>
            </div>

            <div className="auth-actions">
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || verificationCode.trim().length !== 6}
              >
                {loading ? 'Verifying code...' : 'Verify Code'}
              </button>
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleModeChange('signup')}
              >
                Change email address
              </button>
            </div>
          </form>
        )}

        {/* RESET PASSWORD REQUEST */}
        {mode === 'reset-request' && (
          <form className="auth-form" onSubmit={handleResetRequest}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-email">
                Account Email
              </label>
              <div className="auth-input-wrap">
                <Icon name="mail" size={16} className="auth-input-icon" />
                <input
                  id="reset-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-actions">
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Sending instructions...' : 'Request Password Reset'}
              </button>
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleModeChange('login')}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* RESET PASSWORD CONFIRM */}
        {mode === 'reset-confirm' && (
          <form className="auth-form" onSubmit={handleResetConfirm}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-token">
                Reset Token
              </label>
              <div className="auth-input-wrap">
                <Icon name="key" size={16} className="auth-input-icon" />
                <input
                  id="reset-token"
                  type="text"
                  required
                  placeholder="Enter reset token from email"
                  className="auth-input"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="new-password">
                New Password (min. 8 characters)
              </label>
              <div className="auth-input-wrap">
                <Icon name="lock" size={16} className="auth-input-icon" />
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="auth-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="auth-actions">
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleModeChange('login')}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  )
}
