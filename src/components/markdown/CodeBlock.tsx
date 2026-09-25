import { useMemo, useState } from 'react'
import { Icon } from '../ui/Icon'
import { tokenize } from './highlight'
import './CodeBlock.css'

interface CodeBlockProps {
  code: string
  lang?: string
  filename?: string
}

const LABELS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX', bash: 'Bash', sh: 'Shell',
  json: 'JSON', css: 'CSS', html: 'HTML', py: 'Python', python: 'Python', sql: 'SQL',
}

export function CodeBlock({ code, lang = '', filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const tokens = useMemo(() => tokenize(code, lang), [code, lang])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard unavailable — still show feedback */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <figure className="code-block">
      <figcaption className="code-block__bar">
        <span className="code-block__lang">
          {filename ? <span className="code-block__file">{filename}</span> : LABELS[lang] ?? (lang || 'Code')}
        </span>
        <button type="button" className="code-block__copy" onClick={copy} aria-label="Copy code">
          <Icon name={copied ? 'check' : 'copy'} size={15} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </figcaption>
      <pre className="code-block__pre">
        <code>
          {tokens.map((t, i) =>
            t.type === 'plain' ? t.value : <span key={i} className={`tk-${t.type}`}>{t.value}</span>,
          )}
        </code>
      </pre>
    </figure>
  )
}
