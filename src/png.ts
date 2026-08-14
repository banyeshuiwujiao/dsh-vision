// Minimal dependency-free PNG decode/encode for the deterministic image ops.
// Supports 8-bit non-interlaced color types 0 (gray), 2 (RGB), 6 (RGBA).
// Anything else (palette, 16-bit, Adam7) is rejected with a clear error.

import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'

export interface PngImage {
  width: number
  height: number
  /** RGBA pixels, row-major, 4 bytes per pixel. */
  data: Uint8Array
}

export class PngError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PngError'
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

export function decodePng(input: Uint8Array): PngImage {
  if (input.length < 8 || Buffer.from(input.subarray(0, 8)).toString('latin1') !== '\x89PNG\r\n\x1a\n') {
    throw new PngError('not a PNG file')
  }
  const view = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat: Buffer[] = []
  while (offset + 8 <= view.length) {
    const length = view.readUInt32BE(offset)
    const type = view.subarray(offset + 4, offset + 8).toString('latin1')
    const data = view.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
  }
  if (!width || !height) throw new PngError('PNG has no IHDR')
  if (width < 1 || height < 1 || width > 32768 || height > 32768) {
    throw new PngError(`unsupported PNG dimensions ${width}x${height}`)
  }
  if (bitDepth !== 8) throw new PngError(`unsupported PNG bit depth ${bitDepth} (only 8-bit)`)
  if (colorType !== 0 && colorType !== 2 && colorType !== 6) {
    throw new PngError(`unsupported PNG color type ${colorType} (only grayscale, RGB, RGBA)`)
  }
  if (interlace !== 0) throw new PngError('interlaced PNG is not supported')

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4
  const stride = width * channels
  // Deflate-bomb guard: a legitimate stream can never exceed the declared
  // image size plus a small per-scanline margin.
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height + stride })
  const data = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    switch (filter) {
      case 0: break
      case 1: {
        for (let i = channels; i < stride; i++) line[i] = (line[i] + line[i - channels]) & 0xff
        break
      }
      case 2: {
        for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 0xff
        break
      }
      case 3: {
        for (let i = 0; i < stride; i++) {
          const left = i >= channels ? line[i - channels] : 0
          line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xff
        }
        break
      }
      case 4: {
        for (let i = 0; i < stride; i++) {
          const left = i >= channels ? line[i - channels] : 0
          const upLeft = i >= channels ? prev[i - channels] : 0
          line[i] = (line[i] + paeth(left, prev[i], upLeft)) & 0xff
        }
        break
      }
      default:
        throw new PngError(`unknown PNG filter type ${filter}`)
    }
    const out = y * width * 4
    if (channels === 4) {
      data.set(line, out)
    } else {
      for (let x = 0; x < width; x++) {
        const i = out + x * 4
        const p = x * channels
        if (channels === 1) {
          data[i] = data[i + 1] = data[i + 2] = line[p]
        } else {
          data[i] = line[p]
          data[i + 1] = line[p + 1]
          data[i + 2] = line[p + 2]
        }
        data[i + 3] = 255
      }
    }
    prev.set(line)
  }
  return { width, height, data }
}

export function encodePng(image: PngImage): Buffer {
  const { width, height, data } = image
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

export function readPngFile(path: string): PngImage {
  return decodePng(readFileSync(path))
}
