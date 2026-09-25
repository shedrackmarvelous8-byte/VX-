'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authFetch, getAuthToken, setAuthToken } from '../lib/api'

export interface AuthUser {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  email_verified: boolean
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  isVerified: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ success: boolean; requiresVerification?: boolean; devCode?: string; error?: string }>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  verifyCode: (
    code: string,
    email?: string
  ) => Promise<{ success: boolean; message?: string; remainingAttempts?: number; error?: string }>
  resendVerificationCode: (
    email?: string
  ) => Promise<{ success: boolean; message?: string; devCode?: string; cooldownSeconds?: number; error?: string }>
  checkVerificationStatus: () => Promise<{ verified: boolean; hasActiveCode?: boolean }>
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message?: string; devResetToken?: string; error?: string }>
  confirmPasswordReset: (token: string, newPassword: string) => Promise<{ success: boolean; message?: string; error?: string }>
  updateProfile: (updates: { displayName?: string; avatarUrl?: string }) => Promise<{ success: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    authFetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Unauthenticated')
        return res.json()
      })
      .then((data) => {
        if (!ignore) {
          setUser(data.user || null)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setUser(null)
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.user || null)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const res = await authFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to log in' }
      }
      if (data.session?.token) {
        setAuthToken(data.session.token)
      }
      setUser(data.user)
      return { success: true }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const signup = async (email: string, password: string, displayName?: string) => {
    try {
      const res = await authFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, displayName: displayName?.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to sign up' }
      }
      if (data.session?.token) {
        setAuthToken(data.session.token)
      }
      setUser(data.user)
      return {
        success: true,
        requiresVerification: Boolean(data.requiresVerification),
        devCode: data.devCode,
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const verifyCode = async (code: string, email?: string) => {
    try {
      const res = await authFetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), email: email?.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Verification failed',
          remainingAttempts: data.remainingAttempts,
        }
      }
      if (data.session?.token) {
        setAuthToken(data.session.token)
      }
      if (data.user) {
        setUser(data.user)
      }
      return { success: true, message: data.message }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const resendVerificationCode = async (email?: string) => {
    try {
      const res = await authFetch('/api/auth/verify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email?.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Failed to resend code',
          cooldownSeconds: data.cooldownSeconds,
        }
      }
      return {
        success: true,
        message: data.message,
        devCode: data.devCode,
        cooldownSeconds: data.cooldownSeconds || 60,
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const checkVerificationStatus = async () => {
    try {
      const res = await authFetch('/api/auth/verify/status')
      if (res.ok) {
        const data = await res.json()
        return {
          verified: Boolean(data.verified),
          hasActiveCode: Boolean(data.hasActiveCode),
        }
      }
      return { verified: false }
    } catch {
      return { verified: false }
    }
  }

  const logout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.warn('Logout request failed:', err)
    } finally {
      setAuthToken(null)
      setUser(null)
    }
  }

  const requestPasswordReset = async (email: string) => {
    try {
      const res = await authFetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to request reset' }
      }
      return {
        success: true,
        message: data.message,
        devResetToken: data.devResetToken,
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    try {
      const res = await authFetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to reset password' }
      }
      return { success: true, message: data.message }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const updateProfile = async (updates: { displayName?: string; avatarUrl?: string }) => {
    try {
      const res = await authFetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update profile' }
      }
      setUser(data.user)
      return { success: true }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const contextValue = React.useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isVerified: Boolean(user?.email_verified),
      login,
      signup,
      verifyCode,
      resendVerificationCode,
      checkVerificationStatus,
      logout,
      refreshSession,
      requestPasswordReset,
      confirmPasswordReset,
      updateProfile,
    }),
    [user, loading, refreshSession]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
