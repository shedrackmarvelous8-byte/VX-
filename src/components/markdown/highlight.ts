/**
 * Tiny, dependency-free syntax tokenizer for visual code blocks.
 * Deliberately conservative — swap for Shiki/Prism later without touching CodeBlock's API.
 */
export type TokenType = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'fn' | 'type'
export interface Token { type: TokenType; value: string }

const KEYWORDS = new Set(
  (
    'const let var function return if else for while do switch case break continue new class extends ' +
    'import from export default async await try catch finally throw typeof instanceof in of as interface ' +
    'type enum implements public private protected readonly static void null undefined true false this ' +
    'def elif lambda pass with yield None True False self fn pub mut use impl struct match'
  ).split(' '),
)

const RULES: [TokenType, RegExp][] = [
  ['comment', /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?![!{])[^\n]*)/],
  ['string', /^(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/],
  ['number', /^\b\d+(?:\.\d+)?\b/],
  ['word', /^[A-Za-z_$][\w$]*/] as unknown as [TokenType, RegExp],
  ['plain', /^\s+/],
  ['plain', /^./],
]

export function tokenize(code: string, lang = ''): Token[] {
  const noHashComments = /^(ts|tsx|js|jsx|javascript|typescript|json|css|rust|go|java)$/.test(lang)
  const out: Token[] = []
  let rest = code
  while (rest.length) {
    for (const [type, re] of RULES) {
      if (type === 'comment' && noHashComments && rest[0] === '#') continue
      const m = rest.match(re)
      if (!m) continue
      const value = m[0]
      let t: TokenType = type
      if ((type as string) === 'word') {
        const next = rest.slice(value.length)
        if (KEYWORDS.has(value)) t = 'keyword'
        else if (/^\s*\(/.test(next)) t = 'fn'
        else if (/^[A-Z]/.test(value)) t = 'type'
        else t = 'plain'
      }
      const last = out[out.length - 1]
      if (last && last.type === t && t === 'plain') last.value += value
      else out.push({ type: t, value })
      rest = rest.slice(value.length)
      break
    }
  }
  return out
}
