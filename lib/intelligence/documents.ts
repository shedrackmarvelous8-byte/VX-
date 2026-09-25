export interface ExtractedDocument {
  filename: string
  mimeType: string
  text: string
  isTruncated: boolean
  totalLength: number
  chunks: string[]
}

export interface DocumentChunk {
  index: number
  text: string
  score: number
}

/**
 * Extracts plain text from raw uploaded data (base64 or text)
 */
export function extractTextFromAttachment(
  filename: string,
  mimeType: string,
  rawData: string
): ExtractedDocument {
  let text = ''
  const isBase64 = rawData.includes(';base64,') || /^[A-Za-z0-9+/=]+$/.test(rawData.slice(0, 100))

  try {
    let buffer: Buffer
    if (rawData.includes(';base64,')) {
      const base64Str = rawData.split(';base64,')[1]
      buffer = Buffer.from(base64Str, 'base64')
    } else if (isBase64) {
      buffer = Buffer.from(rawData, 'base64')
    } else {
      buffer = Buffer.from(rawData, 'utf8')
    }

    if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      // Basic PDF text stream extractor
      const rawPdf = buffer.toString('binary')
      const textChunks: string[] = []

      // Match BT ... ET blocks or string literals in PDF
      const streamRegex = /\(([^)]+)\)\s*Tj/g
      let match
      while ((match = streamRegex.exec(rawPdf)) !== null) {
        textChunks.push(match[1])
      }

      if (textChunks.length > 0) {
        text = textChunks.join(' ').replace(/\\([()\\])/g, '$1')
      } else {
        // Fallback: extract printable ASCII sequences from PDF
        const asciiMatches = rawPdf.match(/[A-Za-z0-9 ,.:;!?'"()\-_\n\r]{4,}/g)
        text = asciiMatches ? asciiMatches.slice(0, 200).join(' ') : 'PDF document attached for multimodal processing.'
      }
    } else {
      text = buffer.toString('utf8')
    }
  } catch {
    text = rawData
  }

  // Chunking for large documents (e.g. > 4000 characters)
  const CHUNK_SIZE = 3500
  const OVERLAP = 400
  const chunks: string[] = []

  if (text.length <= CHUNK_SIZE) {
    chunks.push(text)
  } else {
    let start = 0
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length)
      chunks.push(text.substring(start, end))
      start += CHUNK_SIZE - OVERLAP
    }
  }

  return {
    filename,
    mimeType,
    text,
    isTruncated: text.length > 20000,
    totalLength: text.length,
    chunks,
  }
}

/**
 * Retrieves the most relevant chunks from large documents for a specific user query
 */
export function getRelevantChunks(
  doc: ExtractedDocument,
  query: string,
  maxChunks = 3
): string[] {
  if (doc.chunks.length <= maxChunks) {
    return doc.chunks
  }

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)

  const scored: DocumentChunk[] = doc.chunks.map((chunk, index) => {
    let score = 0
    const lower = chunk.toLowerCase()
    for (const term of queryTerms) {
      const matches = lower.split(term).length - 1
      score += matches
    }
    return { index, text: chunk, score }
  })

  // Sort by highest score first, then chronological
  scored.sort((a, b) => b.score - a.score || a.index - b.index)

  return scored.slice(0, maxChunks).map((c) => c.text)
}

/**
 * Extracts key requirements and information from text
 */
export function extractKeyRequirements(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim())
  const requirements: string[] = []

  for (const line of lines) {
    if (
      /^(must|shall|should|required|feature|requirement|needs to|user wants|client wants)[\s:]/i.test(
        line
      ) ||
      /^[-*•]\s+(must|shall|should|user|support|allow|enable|include|build|provide)\b/i.test(
        line
      )
    ) {
      const cleanLine = line.replace(/^[-*•\d.]\s*/, '').trim()
      if (cleanLine.length > 10 && cleanLine.length < 300) {
        requirements.push(cleanLine)
      }
    }
  }

  return requirements.slice(0, 15)
}
