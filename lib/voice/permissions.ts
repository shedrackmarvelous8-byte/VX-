/**
 * Microphone permissions, MediaDevices API diagnostic helpers, and audio stream validation.
 */

export type MicrophonePermissionState =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'insecure'
  | 'no_devices'
  | 'unknown'

export interface MicrophoneDiagnostics {
  isSecureContext: boolean
  isMediaDevicesSupported: boolean
  hasAudioInputDevices: boolean
  permissionState: MicrophonePermissionState
  deviceCount: number
  errorDetails?: string | null
}

export interface RequestMicrophoneResult {
  success: boolean
  stream: MediaStream | null
  permissionState: MicrophonePermissionState
  errorMessage?: string | null
  diagnostics: MicrophoneDiagnostics
}

/**
 * Checks browser secure context, MediaDevices API support, permission status, and audio input hardware.
 */
export async function checkMicrophoneSupportAndState(): Promise<MicrophoneDiagnostics> {
  const isSecure = typeof window !== 'undefined' && Boolean(window.isSecureContext)
  const isSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  if (!isSecure) {
    return {
      isSecureContext: false,
      isMediaDevicesSupported: isSupported,
      hasAudioInputDevices: false,
      permissionState: 'insecure',
      deviceCount: 0,
      errorDetails: 'Microphone access requires a secure HTTPS connection or localhost.',
    }
  }

  if (!isSupported) {
    return {
      isSecureContext: true,
      isMediaDevicesSupported: false,
      hasAudioInputDevices: false,
      permissionState: 'unsupported',
      deviceCount: 0,
      errorDetails: 'Your browser does not support the MediaDevices Web API.',
    }
  }

  let permissionState: MicrophonePermissionState = 'prompt'
  let hasAudioDevices = false
  let deviceCount = 0

  // 1. Query permissions API where available
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      if (status.state === 'granted') permissionState = 'granted'
      else if (status.state === 'denied') permissionState = 'denied'
      else permissionState = 'prompt'
    } catch {
      // Permissions API for microphone not supported in all browsers; fallback to prompt
      permissionState = 'prompt'
    }
  }

  // 2. Check available audio input devices
  try {
    if (navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter((d) => d.kind === 'audioinput')
      deviceCount = audioInputs.length
      hasAudioDevices = deviceCount > 0
      if (deviceCount === 0) {
        permissionState = 'no_devices'
      }
    } else {
      hasAudioDevices = true // Assume true if enumerateDevices is missing
    }
  } catch {
    hasAudioDevices = true // Fallback assume true to attempt getUserMedia
  }

  return {
    isSecureContext: true,
    isMediaDevicesSupported: true,
    hasAudioInputDevices: hasAudioDevices,
    permissionState,
    deviceCount,
  }
}

/**
 * Directly requests microphone access via getUserMedia within an explicit user gesture.
 */
export async function requestMicrophoneStream(): Promise<RequestMicrophoneResult> {
  const diag = await checkMicrophoneSupportAndState()

  if (!diag.isSecureContext) {
    return {
      success: false,
      stream: null,
      permissionState: 'insecure',
      errorMessage: 'Microphone access requires a secure HTTPS connection.',
      diagnostics: diag,
    }
  }

  if (!diag.isMediaDevicesSupported) {
    return {
      success: false,
      stream: null,
      permissionState: 'unsupported',
      errorMessage: 'Your browser does not support audio recording.',
      diagnostics: diag,
    }
  }

  if (!diag.hasAudioInputDevices && diag.deviceCount === 0) {
    return {
      success: false,
      stream: null,
      permissionState: 'no_devices',
      errorMessage: 'No microphone input device was detected on your system.',
      diagnostics: diag,
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    // Validate active audio tracks
    const tracks = stream.getAudioTracks()
    if (!tracks || tracks.length === 0) {
      stopMediaStream(stream)
      return {
        success: false,
        stream: null,
        permissionState: 'no_devices',
        errorMessage: 'Microphone stream returned no active audio tracks.',
        diagnostics: diag,
      }
    }

    const liveTrack = tracks.find((t) => t.readyState === 'live' && t.enabled)
    if (!liveTrack) {
      stopMediaStream(stream)
      return {
        success: false,
        stream: null,
        permissionState: 'unknown',
        errorMessage: 'Microphone track is not active or is disabled.',
        diagnostics: diag,
      }
    }

    return {
      success: true,
      stream,
      permissionState: 'granted',
      diagnostics: { ...diag, permissionState: 'granted' },
    }
  } catch (err: unknown) {
    const error = err as Error
    const errorName = error.name || ''

    let permissionState: MicrophonePermissionState = 'unknown'
    let userMsg = 'Could not access microphone.'

    if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      permissionState = 'denied'
      userMsg = 'Microphone access is blocked for VX. Please allow microphone access in site settings.'
    } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      permissionState = 'no_devices'
      userMsg = 'No microphone input device was detected.'
    } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      userMsg = 'Microphone is currently in use by another application or hardware is busy.'
    } else if (errorName === 'OverconstrainedError') {
      userMsg = 'Microphone constraints cannot be satisfied by your input device.'
    } else if (errorName === 'SecurityError') {
      permissionState = 'insecure'
      userMsg = 'Microphone access was restricted by security policy.'
    } else if (errorName === 'AbortError') {
      userMsg = 'Microphone request was aborted.'
    } else if (error.message) {
      userMsg = error.message
    }

    return {
      success: false,
      stream: null,
      permissionState,
      errorMessage: userMsg,
      diagnostics: { ...diag, permissionState, errorDetails: userMsg },
    }
  }
}

/**
 * Stops all tracks in a MediaStream cleanly.
 */
export function stopMediaStream(stream: MediaStream | null) {
  if (!stream) return
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore track stop errors
      }
    })
  } catch {
    // Ignore stream getTracks errors
  }
}
