import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normToPx, pxToNormOfOriginal, normOfOriginalToPx, normalizedAdapter } from '../lib/coords.js'

const fullView = { viewBox: { x1: 0, y1: 0, x2: 800, y2: 600 }, viewDims: { width: 800, height: 600 } }

test('normToPx scales the 0-1000 grid to view pixels', () => {
  const box = normToPx({ x1: 0, y1: 0, x2: 500, y2: 1000 }, fullView)
  assert.deepEqual(box, { x1: 0, y1: 0, x2: 400, y2: 600 })
})

test('normToPx maps through a crop origin', () => {
  const view = { viewBox: { x1: 100, y1: 50, x2: 500, y2: 450 }, viewDims: { width: 400, height: 400 } }
  const box = normToPx({ x1: 0, y1: 0, x2: 1000, y2: 1000 }, view)
  assert.deepEqual(box, { x1: 100, y1: 50, x2: 500, y2: 450 })
})

test('normToPx clamps out-of-range values into the original image', () => {
  const box = normToPx({ x1: -100, y1: -50, x2: 1200, y2: 1500 }, fullView)
  assert.deepEqual(box, { x1: 0, y1: 0, x2: 800, y2: 600 })
})

test('px-norm-px roundtrip is stable', () => {
  const px = { x1: 123, y1: 45, x2: 678, y2: 512 }
  const norm = pxToNormOfOriginal(px, fullView.viewDims)
  const back = normOfOriginalToPx(norm, fullView.viewDims)
  assert.deepEqual(back, px)
})

test('normalizedAdapter parses and orders a raw box', () => {
  const norm = normalizedAdapter.toNorm([400, 300, 800, 700], fullView)
  assert.deepEqual(norm, { x1: 400, y1: 300, x2: 800, y2: 700 })
  const swapped = normalizedAdapter.toNorm([800, 700, 400, 300], fullView)
  assert.deepEqual(swapped, { x1: 400, y1: 300, x2: 800, y2: 700 })
})

test('normalizedAdapter rejects malformed input', () => {
  assert.equal(normalizedAdapter.toNorm([1, 2, 3], fullView), null)
  assert.equal(normalizedAdapter.toNorm('nope', fullView), null)
  assert.equal(normalizedAdapter.toNorm([1, 2, 3, 'x'], fullView), null)
})
