import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

// Generate pure valid PNG with standard PNG chunks
function createPng(width, height, drawFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData.writeUInt8(8, 8)
  ihdrData.writeUInt8(6, 9)
  ihdrData.writeUInt8(0, 10)
  ihdrData.writeUInt8(0, 11)
  ihdrData.writeUInt8(0, 12)
  const ihdrChunk = createChunk('IHDR', ihdrData)

  const scanlineLength = 1 + width * 4
  const rawData = Buffer.alloc(scanlineLength * height)

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength
    rawData[rowOffset] = 0
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4
      const [r, g, b, a] = drawFn(x, y, width, height)
      rawData[pixelOffset] = r
      rawData[pixelOffset + 1] = g
      rawData[pixelOffset + 2] = b
      rawData[pixelOffset + 3] = a
    }
  }

  const compressed = zlib.deflateSync(rawData)
  const idatChunk = createChunk('IDAT', compressed)
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createChunk(type, data) {
  const len = data.length
  const header = Buffer.alloc(4)
  header.writeUInt32BE(len, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const toCrc = Buffer.concat([typeBuf, data])
  const crc = crc32(toCrc)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc, 0)
  return Buffer.concat([header, typeBuf, data, crcBuf])
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)
  if (l2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)))
}

function drawVxIcon(x, y, w, h, isMaskable = false) {
  const scale = isMaskable ? 0.65 : 0.8
  const strokeW = w * 0.085 * scale

  let bgR = 14
  let bgG = 14
  let bgB = 18

  const v1 = [w * (0.5 - 0.26 * scale), h * (0.5 - 0.22 * scale)]
  const v2 = [w * (0.5 - 0.1 * scale), h * (0.5 + 0.24 * scale)]
  const v3 = [w * (0.5 + 0.02 * scale), h * (0.5 - 0.22 * scale)]

  const x1a = [w * (0.5 + 0.04 * scale), h * (0.5 - 0.22 * scale)]
  const x1b = [w * (0.5 + 0.28 * scale), h * (0.5 + 0.24 * scale)]

  const x2a = [w * (0.5 + 0.28 * scale), h * (0.5 - 0.22 * scale)]
  const x2b = [w * (0.5 + 0.04 * scale), h * (0.5 + 0.24 * scale)]

  const dV1 = pointToSegmentDistance(x, y, v1[0], v1[1], v2[0], v2[1])
  const dV2 = pointToSegmentDistance(x, y, v2[0], v2[1], v3[0], v3[1])
  const dX1 = pointToSegmentDistance(x, y, x1a[0], x1a[1], x1b[0], x1b[1])
  const dX2 = pointToSegmentDistance(x, y, x2a[0], x2a[1], x2b[0], x2b[1])

  const minDist = Math.min(dV1, dV2, dX1, dX2)
  const halfW = strokeW / 2
  const edge = 1.0

  if (minDist <= halfW - edge) {
    return [245, 245, 247, 255]
  } else if (minDist <= halfW + edge) {
    const factor = (halfW + edge - minDist) / (2 * edge)
    const r = Math.round(245 * factor + bgR * (1 - factor))
    const g = Math.round(245 * factor + bgG * (1 - factor))
    const b = Math.round(247 * factor + bgB * (1 - factor))
    return [r, g, b, 255]
  }

  if (!isMaskable) {
    const borderDist = Math.min(x, y, w - 1 - x, h - 1 - y)
    if (borderDist < 2) {
      return [35, 35, 42, 255]
    }
  }

  return [bgR, bgG, bgB, 255]
}

const targets = [
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'app/applet/public'),
  '/public',
]

for (const pubDir of targets) {
  try {
    if (!fs.existsSync(pubDir)) {
      fs.mkdirSync(pubDir, { recursive: true })
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="108" fill="#0d0d11" />
  <rect width="510" height="510" x="1" y="1" rx="107" fill="none" stroke="#26262e" stroke-width="2" />
  <path d="M120 160 L205 352 L260 160" fill="none" stroke="#f5f5f7" stroke-width="38" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M280 160 L392 352" fill="none" stroke="#f5f5f7" stroke-width="38" stroke-linecap="round" />
  <path d="M392 160 L280 352" fill="none" stroke="#f5f5f7" stroke-width="38" stroke-linecap="round" />
</svg>`

    fs.writeFileSync(path.join(pubDir, 'icon.svg'), svgContent)

    const png192 = createPng(192, 192, (x, y, w, h) => drawVxIcon(x, y, w, h, false))
    fs.writeFileSync(path.join(pubDir, 'icon-192.png'), png192)

    const png512 = createPng(512, 512, (x, y, w, h) => drawVxIcon(x, y, w, h, false))
    fs.writeFileSync(path.join(pubDir, 'icon-512.png'), png512)

    const pngMaskable = createPng(512, 512, (x, y, w, h) => drawVxIcon(x, y, w, h, true))
    fs.writeFileSync(path.join(pubDir, 'icon-maskable.png'), pngMaskable)

    const pngApple = createPng(180, 180, (x, y, w, h) => drawVxIcon(x, y, w, h, false))
    fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), pngApple)

    const pngFavicon = createPng(48, 48, (x, y, w, h) => drawVxIcon(x, y, w, h, false))
    fs.writeFileSync(path.join(pubDir, 'favicon.png'), pngFavicon)
    console.log(`Generated icons in ${pubDir}`)
  } catch (err) {
    // Ignore non-existent targets
  }
}
