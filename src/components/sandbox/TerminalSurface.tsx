import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'

interface CommandEntry {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  duration: number
  status: 'success' | 'failed' | 'timeout' | 'rejected'
  timestamp: string
}

interface TerminalSurfaceProps {
  projectId: string
  projectName?: string
}

const PRESET_COMMANDS = [
  'npm run build',
  'npm run dev',
  'npm test',
  'npm list --depth=0',
  'ls -la',
]

export function TerminalSurface({ projectId, projectName }: TerminalSurfaceProps) {
  const [history, setHistory] = useState<CommandEntry[]>([
    {
      id: 'init',
      command: 'echo "VX Sandbox Terminal ready"',
      stdout: `Connected to isolated project workspace: ${projectName || projectId}\nType a development command (e.g. npm run build, npm test, npm install <pkg>) and press Enter.`,
      stderr: '',
      exitCode: 0,
      duration: 1,
      status: 'success',
      timestamp: 'Ready',
    },
  ])

  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [historyIdx, setHistoryIdx] = useState<number | null>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])

  const cmdCounter = useRef(0)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [history, scrollToBottom])

  const runCommand = useCallback(
    async (cmdToRun: string) => {
      const trimmed = cmdToRun.trim()
      if (!trimmed || isRunning) return

      setIsRunning(true)
      setInput('')
      setHistoryIdx(null)
      setCommandHistory((prev) => [...prev, trimmed])

      cmdCounter.current += 1
      const tempId = `cmd_${cmdCounter.current}`
      const startTs = new Date().toLocaleTimeString()

      try {
        const res = await authFetch('/api/sandbox/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            command: trimmed,
          }),
        })

        const data = await res.json()
        const result = data.result || {}

        setHistory((prev) => [
          ...prev,
          {
            id: tempId,
            command: trimmed,
            stdout: result.stdout || '',
            stderr: result.stderr || (data.error ? String(data.error) : ''),
            exitCode: result.exitCode ?? (data.success ? 0 : 1),
            duration: result.duration || 0,
            status: result.status || (data.success ? 'success' : 'failed'),
            timestamp: startTs,
          },
        ])
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setHistory((prev) => [
          ...prev,
          {
            id: tempId,
            command: trimmed,
            stdout: '',
            stderr: `Network or execution error: ${errorMsg}`,
            exitCode: 1,
            duration: 0,
            status: 'failed',
            timestamp: startTs,
          },
        ])
      } finally {
        setIsRunning(false)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [isRunning, projectId]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(input)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length === 0) return
      const nextIdx = historyIdx === null ? commandHistory.length - 1 : Math.max(0, historyIdx - 1)
      setHistoryIdx(nextIdx)
      setInput(commandHistory[nextIdx])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx === null) return
      const nextIdx = historyIdx + 1
      if (nextIdx >= commandHistory.length) {
        setHistoryIdx(null)
        setInput('')
      } else {
        setHistoryIdx(nextIdx)
        setInput(commandHistory[nextIdx])
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      setInput('')
    }
  }

  const clearTerminal = () => {
    setHistory([])
    inputRef.current?.focus()
  }

  return (
    <div className="terminal-container">
      <div className="terminal-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#58a6ff', fontWeight: 600 }}>sandbox:</span>
          <span>~/{projectName || 'project'}</span>
          <span className={`status-pill status-pill--${isRunning ? 'starting' : 'running'}`}>
            <span className="status-dot" />
            {isRunning ? 'Running' : 'Ready'}
          </span>
        </div>
        <button
          className="surface-tab"
          onClick={clearTerminal}
          title="Clear Terminal Output"
          style={{ padding: '2px 8px', fontSize: '11px' }}
        >
          Clear
        </button>
      </div>

      <div className="terminal-chips">
        <span style={{ color: '#8b949e', fontSize: '11px', marginRight: '4px' }}>Quick:</span>
        {PRESET_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            className="terminal-chip"
            onClick={() => runCommand(cmd)}
            disabled={isRunning}
          >
            {cmd}
          </button>
        ))}
      </div>

      <div className="terminal-output" ref={outputRef}>
        {history.map((item) => (
          <div key={item.id} className="terminal-entry">
            <div className="terminal-cmd-line">
              <span className="terminal-prompt">$</span>
              <span>{item.command}</span>
            </div>
            {item.stdout ? <pre className="terminal-stdout">{item.stdout}</pre> : null}
            {item.stderr ? <pre className="terminal-stderr">{item.stderr}</pre> : null}
            <div className="terminal-meta">
              <span>Exit code: {item.exitCode ?? 'none'}</span>
              <span>{item.duration}ms</span>
              <span>{item.timestamp}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="terminal-input-row">
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Command is running...' : 'Type a command (e.g. npm test)...'}
          disabled={isRunning}
          autoFocus
        />
        {isRunning && (
          <span style={{ fontSize: '11px', color: '#facc15' }}>Executing...</span>
        )}
      </div>
    </div>
  )
}
