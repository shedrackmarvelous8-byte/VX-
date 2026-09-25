import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAutoResize } from '../../hooks/useAutoResize'
import type { Attachment, InputMode, Message } from '../../types/chat'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { VoicePanel } from '../voice/VoicePanel'
import './Composer.css'

export interface ComposerHandle {
  focus: () => void
  setText: (text: string) => void
}

interface ComposerProps {
  conversationId?: string | null
  mode: InputMode
  onModeChange: (mode: InputMode) => void
  onSend: (text: string, attachments: Attachment[]) => void
  onVoiceTurnComplete?: (userMessage: Message, assistantMessage: Message) => void
  placeholder?: string
}

const uid = () => Math.random().toString(36).slice(2, 10)
const formatSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`)

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    conversationId,
    mode,
    onModeChange,
    onSend,
    onVoiceTurnComplete,
    placeholder = 'Ask the AI to build something...',
  },
  ref,
) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useAutoResize(taRef, text)

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setText: (t) => {
      setText(t)
      requestAnimationFrame(() => {
        const el = taRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(t.length, t.length)
      })
    },
  }))

  const canSend = text.trim().length > 0 || files.length > 0

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(text.trim(), files)
    setText('')
    setFiles([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on hardware keyboards; on touch devices Enter inserts a newline.
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) submit(e)
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setFiles((prev) => [
      ...prev,
      ...Array.from(list).map((f) => ({
        id: uid(),
        name: f.name,
        size: f.size,
        kind: f.type.startsWith('image/') ? ('image' as const) : ('file' as const),
      })),
    ])
    if (fileRef.current) fileRef.current.value = ''
  }

  const isVoice = mode === 'voice'

  // Voice is another mode of the *same* conversation — the draft and thread stay in place.
  if (isVoice) {
    return (
      <div className="composer-dock">
        <VoicePanel
          conversationId={conversationId}
          onExit={() => onModeChange('text')}
          onTurnComplete={onVoiceTurnComplete}
        />
        <p className="composer__note">AI can make mistakes. Review code before shipping.</p>
      </div>
    )
  }

  return (
    <div className="composer-dock">
      <form className="composer" data-mode={mode} onSubmit={submit}>
        {files.length > 0 && (
          <ul className="composer__files" aria-label="Attachments">
            {files.map((f) => (
              <li key={f.id} className="composer__file">
                <span className="composer__file-icon"><Icon name="file" size={16} /></span>
                <span className="composer__file-meta">
                  <span className="composer__file-name">{f.name}</span>
                  {f.size != null && <span className="composer__file-size">{formatSize(f.size)}</span>}
                </span>
                <button
                  type="button"
                  className="composer__file-remove"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                >
                  <Icon name="close" size={14} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="composer__field">
          <span className="sr-only">Message</span>
          <textarea
            ref={taRef}
            className="composer__input"
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            enterKeyHint="enter"
            autoComplete="off"
            spellCheck
          />
        </label>

        <div className="composer__bar">
          <div className="composer__tools">
            <IconButton icon="plus" label="Attach files" onClick={() => fileRef.current?.click()} iconSize={21} />
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
          <div className="composer__tools">
            <IconButton
              icon="mic"
              label="Switch to voice"
              onClick={() => onModeChange('voice')}
            />
            <IconButton
              type="submit"
              icon="arrowUp"
              label="Send message"
              variant="primary"
              disabled={!canSend}
              iconSize={19}
              className="composer__send"
            />
          </div>
        </div>
      </form>
      <p className="composer__note">AI can make mistakes. Review code before shipping.</p>
    </div>
  )
})
