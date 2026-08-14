import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodePng, decodePng } from '../lib/png.js'
import { blockDiff, imageDiff } from '../lib/diff.js'
import { drawBoxes } from '../lib/annotate.js'

const dir = join(process.cwd(), 'test', 'tmp-diff')
mkdirSync(dir, { recursive: true })

function solidPng(width, height, rgba) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return encodePng({ width, height, data })
}

const aPath = join(dir, 'a.png')
const bPath = join(dir, 'b.png')

test('blockDiff reports zero for identical images', () => {
  const a = decodePng(solidPng(32, 32, [1, 2, 3, 255]))
  const result = blockDiff(a, a)
  assert.equal(result.percent, 0)
  assert.equal(result.changedPixels, 0)
  assert.equal(result.blocks.length, 0)
})

test('blockDiff finds a single changed pixel and its block', () => {
  const a = decodePng(solidPng(32, 32, [1, 2, 3, 255]))
  const b = decodePng(solidPng(32, 32, [1, 2, 3, 255]))
  b.data[10 * 4] = 255 // pixel (10, 0) turns red-ish
  const result = blockDiff(a, b)
  assert.equal(result.changedPixels, 1)
  assert.ok(result.percent > 0 && result.percent < 0.2)
  assert.equal(result.blocks.length, 1)
  const block = result.blocks[0]
  assert.ok(block.x1 <= 10 && 10 < block.x2)
  assert.ok(block.y1 <= 0 && 0 < block.y2)
})

test('blockDiff respects the per-channel tolerance', () => {
  const a = decodePng(solidPng(16, 16, [100, 100, 100, 255]))
  const b = decodePng(solidPng(16, 16, [104, 100, 100, 255])) // within ±8? 4 <= 8 -> unchanged
  assert.equal(blockDiff(a, b, 8).changedPixels, 0)
  assert.equal(blockDiff(a, b, 2).changedPixels, 16 * 16)
})

test('blockDiff counts transparency-only changes', () => {
  const a = decodePng(solidPng(8, 8, [100, 100, 100, 255]))
  const b = decodePng(solidPng(8, 8, [100, 100, 100, 0])) // identical RGB, different alpha
  const result = blockDiff(a, b)
  assert.equal(result.changedPixels, 8 * 8)
})

test('imageDiff compares the overlap when sizes differ', () => {
  writeFileSync(aPath, solidPng(32, 32, [1, 2, 3, 255]))
  writeFileSync(bPath, solidPng(48, 32, [1, 2, 3, 255]))
  const result = imageDiff(aPath, bPath)
  assert.equal(result.overlapOnly, true)
  assert.equal(result.percent, 0)
})

test('imageDiff end-to-end with a real file difference', () => {
  writeFileSync(aPath, solidPng(32, 32, [1, 2, 3, 255]))
  writeFileSync(bPath, solidPng(32, 32, [200, 2, 3, 255]))
  const result = imageDiff(aPath, bPath)
  assert.equal(result.changedPixels, 32 * 32)
  assert.equal(result.blocks.length, 4) // 32x32 at blockSize 16 = a 2x2 grid
  assert.ok(result.blocks[0].changed > 0)
})

test('drawBoxes paints borders without touching the interior', () => {
  const image = decodePng(solidPng(20, 20, [10, 10, 10, 255]))
  const drawn = drawBoxes(image, [{ x1: 5, y1: 5, x2: 15, y2: 15 }])
  const pixel = (x, y) => [...drawn.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4)]
  assert.deepEqual(pixel(5, 5), [45, 107, 254, 255], 'corner painted')
  assert.deepEqual(pixel(10, 5), [45, 107, 254, 255], 'top edge painted')
  assert.deepEqual(pixel(5, 10), [45, 107, 254, 255], 'left edge painted')
  assert.deepEqual(pixel(10, 10), [10, 10, 10, 255], 'interior untouched')
})

test('cleanup', () => {
  rmSync(dir, { recursive: true, force: true })
})
