import { Fragment, type ReactNode } from 'react'
import { CodeBlock } from './CodeBlock'
import './Markdown.css'

/**
 * Lightweight markdown renderer (no deps, no dangerouslySetInnerHTML).
 * Supports: headings, paragraphs, bold/italic, inline code, links, ordered/unordered
 * lists (incl. task items), blockquotes, rules and fenced code blocks (```lang filename).
 */

type Block =
  | { t: 'code'; lang: string; filename?: string; code: string }
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'hr' }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^```\s*([\w+-]*)\s*(\S*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
      i++
      blocks.push({ t: 'code', lang: fence[1], filename: fence[2] || undefined, code: body.join('\n') })
      continue
    }
    if (!line.trim()) { i++; continue }
    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) { blocks.push({ t: 'h', level: h[1].length, text: h[2] }); i++; continue }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ t: 'hr' }); i++; continue }
    if (/^>\s?/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ t: 'quote', text: q.join(' ') })
      continue
    }
    const listRe = /^\s*([-*]|\d+\.)\s+/
    if (listRe.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && listRe.test(lines[i])) items.push(lines[i++].replace(listRe, ''))
      blocks.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }
    const para: string[] = []
    while (
      i < lines.length && lines[i].trim() &&
      !/^(```|#{1,4}\s|>|\s*([-*]|\d+\.)\s)/.test(lines[i])
    ) para.push(lines[i++])
    blocks.push({ t: 'p', text: para.join(' ') })
  }
  return blocks
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith('`')) return <code key={i} className="md-inline-code">{part.slice(1, -1)}</code>
    if (part.startsWith('**')) return <strong key={i}>{renderInline(part.slice(2, -2))}</strong>
    if (part.startsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    return <Fragment key={i}>{part}</Fragment>
  })
}

function ListItem({ text }: { text: string }) {
  const task = text.match(/^\[( |x)\]\s+(.*)/i)
  if (!task) return <li>{renderInline(text)}</li>
  const done = task[1].toLowerCase() === 'x'
  return (
    <li className="md-task" data-done={done || undefined}>
      <span className="md-task__box" aria-hidden="true">{done ? '✓' : ''}</span>
      <span>{renderInline(task[2])}</span>
    </li>
  )
}

export function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content)
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'code': return <CodeBlock key={i} code={b.code} lang={b.lang} filename={b.filename} />
          case 'h': {
            const Tag = (`h${Math.min(b.level + 1, 5)}`) as 'h2'
            return <Tag key={i}>{renderInline(b.text)}</Tag>
          }
          case 'p': return <p key={i}>{renderInline(b.text)}</p>
          case 'ul': return <ul key={i}>{b.items.map((it, j) => <ListItem key={j} text={it} />)}</ul>
          case 'ol': return <ol key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>
          case 'quote': return <blockquote key={i}>{renderInline(b.text)}</blockquote>
          case 'hr': return <hr key={i} />
        }
      })}
    </div>
  )
}
