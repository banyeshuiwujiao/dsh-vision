// Deterministic local crop (PNG), optionally nearest-neighbor upscaled. The
// zoom arm of the pipeline: the crop replaces the image before upload, so a
// small region reaches the vision model at full resolution. Upscaling is
// plain pixel replication — generative super-resolution is never used (it
// invents strokes and worsens reading).

import { readFileSync, writeFileSync } from 'node:fs'
import { extname, join, dirname, basename } from 'node:path'
import { decodePng, encodePng, PngError, type PngImage } from './png.js'
import { parseRegion } from './bbox.js'

export class CropError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CropError'
  }
}

export function requirePng(path: string): PngImage {
  if (extname(path).toLowerCase() !== '.png') {
    throw new CropError(`only PNG is supported by this tool: ${path}`)
  }
  try {
    return decodePng(readFileSync(path))
  } catch (error) {
    if (error instanceof PngError) throw new CropError(`${path}: ${error.message}`)
    throw new CropError(`cannot read image: ${path}`)
  }
}

function upscaleNearest(data: Uint8Array, width: number, height: number, scale: number): { data: Uint8Array; width: number; height: number } {
  const scaled = new Uint8Array(width * height * scale * scale * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      for (let dy = 0; dy < scale; dy++) {
        const dstRow = (y * scale + dy) * width * scale * 4
        for (let dx = 0; dx < scale; dx++) {
          scaled.set(data.subarray(src, src + 4), dstRow + (x * scale + dx) * 4)
        }
      }
    }
  }
  return { data: scaled, width: width * scale, height: height * scale }
}

/** Extract a pixel box from a PNG and write it to a new file. */
export function cropPngRegion(imagePath: string, region: { x1: number; y1: number; x2: number; y2: number }, outPath: string | null, scale = 1): { path: string; width: number; height: number; scale: number } {
  const image = requirePng(imagePath)
  const { x1, y1, x2, y2 } = region
  let data: Uint8Array = new Uint8Array((x2 - x1) * (y2 - y1) * 4)
  for (let y = y1; y < y2; y++) {
    const rowStart = y * image.width * 4
    data.set(image.data.subarray(rowStart + x1 * 4, rowStart + x2 * 4), (y - y1) * (x2 - x1) * 4)
  }
  let width = x2 - x1
  let height = y2 - y1
  if (scale !== 1) {
    const upscaled = upscaleNearest(data, width, height, scale)
    data = upscaled.data
    width = upscaled.width
    height = upscaled.height
  }
  const stem = basename(imagePath, '.png')
  const target = outPath ?? join(dirname(imagePath), `${stem}.crop${scale === 1 ? '' : `@${scale}x`}.png`)
  writeFileSync(target, encodePng({ width, height, data }))
  return { path: target, width, height, scale }
}

/** Clamp a region string against a PNG's real size (helper for tool args). */
export function regionFor(imagePath: string, region?: string): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!region) return null
  const image = requirePng(imagePath)
  return parseRegion(region, image.width, image.height)
}
