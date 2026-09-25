'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useGeminiLive, type LiveVoiceState } from '../../hooks/useGeminiLive'
import type { Message } from '../../types/chat'
import './VoicePanel.css'

const labels: Record<LiveVoiceState, string> = {
  idle: 'Tap to start talking',
  connecting: 'Connecting to Gemini Live...',
  connected: 'Connected',
  listening: 'Listening...',
  processing: 'Processing speech...',
  speaking: 'Speaking...',
  interrupted: 'Interrupted',
  error: 'Voice connection error',
  ended: 'Voice ended',
}

/** Per-bar amplitude seed for the activity visualization. */
const BARS = [
  0.45, 0.7, 0.35, 0.9, 0.55, 0.3, 0.75, 0.5, 0.95, 0.6, 0.4, 0.8, 0.5, 0.65, 0.35, 0.85, 0.45,
  0.7, 0.4, 0.8, 0.5,
]

interface VoicePanelProps {
  conversationId?: string | null
  /** Return to the text composer — the same conversation stays in place. */
  onExit: () => void
  onTurnComplete?: (userMessage: Message, assistantMessage: Message) => void
}

/**
 * Live voice surface connected directly to Google Gemini Live API.
 * Voice is simply another communication mode of the current conversation.
 */
export function VoicePanel({ conversationId, onExit, onTurnComplete }: VoicePanelProps) {
  const exitRef = useRef<HTMLButtonElement>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const {
    state,
    muted,
    errorMessage,
    permissionState,
    diagnostics,
    requestMicrophonePermission,
    toggleMute,
  } = useGeminiLive({
    conversationId,
    enabled: true,
    onTurnComplete,
    onExit,
  })

  useEffect(() => {
    exitRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const status = errorMessage
    ? errorMessage
    : muted
    ? 'Microphone off'
    : labels[state] || 'Listening...'

  const isPermissionNeeded = permissionState === 'prompt' || permissionState === 'unknown'
  const isPermissionDenied = permissionState === 'denied' || state === 'error'
  const isInsecure = permissionState === 'insecure'
  const isNoDevices = permissionState === 'no_devices'

  return (
    <section
      className="voice"
      data-muted={muted || undefined}
      data-state={muted ? 'muted' : state}
      aria-label="Voice mode"
    >
      <div className="voice__top">
        <p className="voice__status" role="status">
          <span className="voice__dot" aria-hidden="true" />
          {status}
        </p>
        <IconButton ref={exitRef} icon="close" label="End voice" onClick={onExit} />
      </div>

      {/* Wave Visualizer */}
      <div className="voice__wave" aria-hidden="true">
        {BARS.map((h, i) => (
          <span
            key={i}
            className="voice__bar"
            style={
              {
                '--h': state === 'speaking' || state === 'listening' ? h : 0.2,
                animationDelay: `${(i % 6) * 90}ms`,
                animationDuration: `${980 + (i % 5) * 130}ms`,
                animationPlayState: state === 'listening' || state === 'speaking' ? 'running' : 'paused',
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* Explicit Permission Request & Recovery Banner */}
      {(isPermissionNeeded || isPermissionDenied || isInsecure || isNoDevices) && (
        <div className="voice__recovery">
          <div className="voice__recovery-actions">
            {!isInsecure && !isNoDevices && (
              <button
                type="button"
                className="voice__enable-btn"
                onClick={requestMicrophonePermission}
              >
                <Icon name="mic" size={18} />
                {permissionState === 'denied' ? 'Try Again' : 'Enable Microphone'}
              </button>
            )}

            {permissionState === 'denied' && (
              <button
                type="button"
                className="voice__guide-btn"
                onClick={() => setShowGuide((prev) => !prev)}
              >
                <Icon name="settings" size={15} />
                {showGuide ? 'Hide Instructions' : 'How to enable microphone'}
              </button>
            )}

            <button
              type="button"
              className="voice__diag-btn"
              onClick={() => setShowDiagnostics((prev) => !prev)}
            >
              <Icon name="bug" size={15} />
              {showDiagnostics ? 'Hide Diagnostics' : 'Diagnostics'}
            </button>
          </div>

          {/* How to enable microphone guide */}
          {showGuide && (
            <div className="voice__guide-box">
              <p className="voice__guide-title">How to allow microphone access on Chrome & Android:</p>
              <ol className="voice__guide-list">
                <li>Tap the lock / tune icon in your browser address bar next to the URL.</li>
                <li>Tap <strong>Permissions</strong> ➔ <strong>Microphone</strong>.</li>
                <li>Select <strong>Allow</strong>.</li>
                <li>Return to VX and tap <strong>Try Again</strong> above.</li>
              </ol>
            </div>
          )}

          {/* Safe Non-Sensitive Diagnostics */}
          {showDiagnostics && (
            <div className="voice__diag-box">
              <div className="voice__diag-item">
                <span>Secure HTTPS Context:</span>
                <strong>{diagnostics.isSecureContext ? 'Yes (Secure)' : 'No (Requires HTTPS)'}</strong>
              </div>
              <div className="voice__diag-item">
                <span>MediaDevices Web API:</span>
                <strong>{diagnostics.isMediaDevicesSupported ? 'Supported' : 'Unsupported'}</strong>
              </div>
              <div className="voice__diag-item">
                <span>Permission State:</span>
                <strong style={{ textTransform: 'uppercase' }}>{permissionState}</strong>
              </div>
              <div className="voice__diag-item">
                <span>Audio Input Hardware:</span>
                <strong>{diagnostics.hasAudioInputDevices ? `Detected (${diagnostics.deviceCount})` : 'None'}</strong>
              </div>
              <div className="voice__diag-item">
                <span>Gemini Live Session:</span>
                <strong>{state.toUpperCase()}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Controls Bar */}
      <div className="voice__controls">
        <button
          type="button"
          className="voice__mic"
          aria-pressed={muted}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          onClick={permissionState === 'granted' ? toggleMute : requestMicrophonePermission}
        >
          <Icon name={muted ? 'micOff' : 'mic'} size={22} />
        </button>
        <button type="button" className="voice__type" onClick={onExit}>
          <Icon name="keyboard" size={19} />
          Type instead
        </button>
      </div>

      <p className="voice__hint">Voice continues this conversation</p>
    </section>
  )
}

