'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '../types/chat'
import {
  checkMicrophoneSupportAndState,
  requestMicrophoneStream,
  stopMediaStream,
  type MicrophoneDiagnostics,
  type MicrophonePermissionState,
} from '@/lib/voice/permissions'

export type LiveVoiceState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted'
  | 'error'
  | 'ended'

interface UseGeminiLiveProps {
  conversationId?: string | null
  enabled: boolean
  onTurnComplete?: (userMessage: Message, assistantMessage: Message) => void
  onExit?: () => void
}

interface WebkitSpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: (event: { results: Array<{ 0: { transcript: string } }> }) => void
  onerror: (event: { error: string }) => void
  start: () => void
  stop: () => void
}

export function useGeminiLive({
  conversationId,
  enabled,
  onTurnComplete,
  onExit,
}: UseGeminiLiveProps) {
  const [state, setState] = useState<LiveVoiceState>('idle')
  const [muted, setMuted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [permissionState, setPermissionState] = useState<MicrophonePermissionState>('unknown')
  const [diagnostics, setDiagnostics] = useState<MicrophoneDiagnostics>({
    isSecureContext: true,
    isMediaDevicesSupported: true,
    hasAudioInputDevices: true,
    permissionState: 'unknown',
    deviceCount: 0,
  })

  const sessionIdRef = useRef<string | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const recognitionRef = useRef<WebkitSpeechRecognitionInstance | null>(null)

  // Initial diagnostics check on mount
  useEffect(() => {
    let isMounted = true
    checkMicrophoneSupportAndState().then((diag) => {
      if (isMounted) {
        setDiagnostics(diag)
        setPermissionState(diag.permissionState)
        if (!diag.isSecureContext) {
          setErrorMessage('Microphone access requires a secure HTTPS connection.')
        } else if (!diag.isMediaDevicesSupported) {
          setErrorMessage('Your browser does not support audio recording.')
        } else if (!diag.hasAudioInputDevices && diag.deviceCount === 0) {
          setErrorMessage('No microphone input device was detected.')
        }
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  // Clean up existing audio playback
  const stopAudioPlayback = useCallback(() => {
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop()
      } catch {
        // Ignore if already stopped
      }
      activeAudioSourceRef.current = null
    }
  }, [])

  // Play audio returned from Gemini Live
  const playBase64Audio = useCallback(async (base64Audio: string) => {
    try {
      stopAudioPlayback()
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioContextRef.current = new AudioCtx()
      }

      const audioCtx = audioContextRef.current
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }

      // Decode base64 to ArrayBuffer
      const binaryString = window.atob(base64Audio)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      setState('speaking')
      const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0))
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioCtx.destination)
      activeAudioSourceRef.current = source

      source.onended = () => {
        setState('listening')
        activeAudioSourceRef.current = null
      }

      source.start(0)
    } catch (err) {
      console.warn('Audio decoding fallback or error:', err)
      setState('listening')
    }
  }, [stopAudioPlayback])

  // Process a user turn
  const handleVoiceTurn = useCallback(
    async (params: { transcript?: string; audioBase64?: string; mimeType?: string }) => {
      if (!sessionIdRef.current) return
      setState('processing')

      try {
        const res = await fetch('/api/live/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            userTranscript: params.transcript,
            audioInputBase64: params.audioBase64,
            audioMimeType: params.mimeType,
          }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => null)
          throw new Error(errData?.error || 'Failed to process voice turn')
        }

        const data = await res.json()

        const userMsg: Message = {
          id: data.userMessage.id,
          role: 'user',
          content: data.userMessage.content,
          createdAt: new Date(data.userMessage.created_at).getTime(),
        }

        const assistantMsg: Message = {
          id: data.assistantMessage.id,
          role: 'assistant',
          content: data.assistantMessage.content,
          createdAt: new Date(data.assistantMessage.created_at).getTime(),
        }

        if (onTurnComplete) {
          onTurnComplete(userMsg, assistantMsg)
        }

        if (data.audioResponseBase64) {
          await playBase64Audio(data.audioResponseBase64)
        } else {
          setState('listening')
        }
      } catch (err: unknown) {
        const error = err as Error
        console.error('Voice turn processing error:', error)
        setErrorMessage(error.message)
        setState('listening')
      }
    },
    [onTurnComplete, playBase64Audio]
  )

  // Start Gemini Live session with an already active MediaStream
  const initializeLiveSessionWithStream = useCallback(async (stream: MediaStream) => {
    try {
      setState('connecting')
      setErrorMessage(null)
      mediaStreamRef.current = stream

      const res = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || 'Failed to start Gemini Live voice session')
      }

      const data = await res.json()
      sessionIdRef.current = data.session.sessionId
      setState('listening')

      // Setup Speech Recognition for real-time transcript streaming
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: { new (): WebkitSpeechRecognitionInstance }; webkitSpeechRecognition?: { new (): WebkitSpeechRecognitionInstance } })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: { new (): WebkitSpeechRecognitionInstance } }).webkitSpeechRecognition

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onresult = (event) => {
          const results = event.results
          const lastResult = results[results.length - 1]
          if (lastResult && lastResult[0]?.transcript) {
            const text = lastResult[0].transcript.trim()
            if (text) {
              handleVoiceTurn({ transcript: text })
            }
          }
        }

        recognition.onerror = (event) => {
          if (event.error !== 'no-speech') {
            console.warn('Speech recognition notice:', event.error)
          }
        }

        recognitionRef.current = recognition
        try {
          recognition.start()
          setIsRecognizing(true)
        } catch {
          // Ignore if already started
        }
      }
    } catch (err: unknown) {
      const error = err as Error
      setState('error')
      setErrorMessage(error.message)
    }
  }, [conversationId, handleVoiceTurn])

  // Explicit user-triggered microphone permission request
  const requestMicrophonePermission = useCallback(async () => {
    setState('connecting')
    setErrorMessage(null)

    const res = await requestMicrophoneStream()
    setPermissionState(res.permissionState)
    setDiagnostics(res.diagnostics)

    if (!res.success || !res.stream) {
      setState('error')
      setErrorMessage(res.errorMessage || 'Microphone permission request failed.')
      return
    }

    await initializeLiveSessionWithStream(res.stream)
  }, [initializeLiveSessionWithStream])

  // Cleanup references
  const cleanupResources = useCallback(() => {
    stopAudioPlayback()

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // Ignore
      }
      recognitionRef.current = null
      setIsRecognizing(false)
    }

    if (mediaStreamRef.current) {
      stopMediaStream(mediaStreamRef.current)
      mediaStreamRef.current = null
    }

    if (sessionIdRef.current) {
      fetch(`/api/live/session?sessionId=${sessionIdRef.current}`, {
        method: 'DELETE',
      }).catch(() => {})
      sessionIdRef.current = null
    }
  }, [stopAudioPlayback])

  const stopLiveSession = useCallback(() => {
    cleanupResources()
    setState('ended')
  }, [cleanupResources])

  useEffect(() => {
    if (enabled) {
      // Auto-check if permission is already granted, else wait for explicit user click
      checkMicrophoneSupportAndState().then((diag) => {
        setDiagnostics(diag)
        setPermissionState(diag.permissionState)
        if (diag.permissionState === 'granted') {
          requestMicrophonePermission()
        } else if (diag.permissionState === 'denied') {
          setState('error')
          setErrorMessage('Microphone access is blocked for VX. Please allow microphone permissions in browser settings.')
        } else {
          setState('idle')
        }
      })

      return () => {
        cleanupResources()
      }
    } else {
      cleanupResources()
    }
  }, [enabled, requestMicrophonePermission, cleanupResources])

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next
        })
      }
      if (next) {
        stopAudioPlayback()
      }
      return next
    })
  }, [stopAudioPlayback])

  return {
    state,
    muted,
    errorMessage,
    isRecognizing,
    permissionState,
    diagnostics,
    requestMicrophonePermission,
    toggleMute,
    stopLiveSession,
    handleVoiceTurn,
  }
}

