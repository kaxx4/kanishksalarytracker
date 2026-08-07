/*
 * Draws the app icon and writes it as PNG at every size the manifest needs.
 *
 * Procedural rather than a checked-in binary: the icon is the ledger itself —
 * paper stock, a vermillion spine, ruled rows and the double rule that closes
 * a total — so it is built from the same palette the app uses, and changing a
 * colour here means changing one hex rather than re-exporting an asset.
 *
 * No image library: the shapes are axis-aligned rectangles, which is just
 * arithmetic on a pixel buffer, and Node already ships zlib and everything
 * else a PNG needs.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const PAPER = [0xf6, 0xf2, 0xe9]
const RAISED = [0xfd, 0xfb, 0xf6]
const RULE_STRONG = [0x94, 0x88, 0x68]
const RULE = [0xda, 0xd1, 0xbe]
const VERMILLION = [0xb2, 0x3a, 0x25]
const VERDIGRIS = [0x3a, 0x6b, 0x52]

/** The design, in a 512-unit square. Everything else scales from it. */
function paint(px, S) {
  const u = S / 512
  const rect = (x, y, w, h, c) => {
    const x0 = Math.round(x * u), y0 = Math.round(y * u)
    const x1 = Math.round((x + w) * u), y1 = Math.round((y + h) * u)
    for (let yy = Math.max(0, y0); yy < Math.min(S, y1); yy++) {
      for (let xx = Math.max(0, x0); xx < Math.min(S, x1); xx++) {
        const i = (yy * S + xx) * 4
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255
      }
    }
  }

  rect(0, 0, 512, 512, PAPER)

  // The bound leaf, with its hairline edge.
  rect(82, 56, 348, 400, RULE_STRONG)
  rect(90, 64, 332, 384, RAISED)

  // Vermillion spine down the binding edge.
  rect(90, 64, 34, 384, VERMILLION)

  // Ruled rows. The last one runs short, the way a part-filled page does.
  for (const y of [150, 206, 262]) rect(156, y, 230, 10, RULE)
  rect(156, 318, 174, 10, RULE)

  // The double rule that closes a total, in the app's own verdigris.
  rect(156, 368, 230, 12, VERDIGRIS)
  rect(156, 396, 230, 12, VERDIGRIS)
}

// ---------------------------------------------------------------- PNG ------

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const px = Buffer.alloc(size * size * 4)
  paint(px, size)

  // One filter byte (0 = none) in front of every scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`
  writeFileSync(out, png(size))
  console.log(`${out}  ${size}x${size}`)
}
