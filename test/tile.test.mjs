import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldTile, planStrips, mergeStrips, unreadableStrip } from '../lib/tile.js'

test('shouldTile triggers only for tall pages', () => {
  assert.equal(shouldTile({ width: 1000, height: 1500 }), false)
  assert.equal(shouldTile({ width: 1000, height: 2000 }), false)
  assert.equal(shouldTile({ width: 1000, height: 3000 }), true)
  assert.equal(shouldTile({ width: 2000, height: 3000 }), false) // not 1.8x taller than wide
})

test('short page plans a single strip', () => {
  const plan = planStrips(1000, 1500)
  assert.equal(plan.strips.length, 1)
  assert.deepEqual(plan.strips[0], { index: 1, count: 1, y1: 0, y2: 1500 })
})

test('tall page: strips are full width, strictly increasing, bottom anchored', () => {
  const height = 6000
  const plan = planStrips(1000, height)
  const { strips } = plan
  assert.ok(strips.length > 1)
  let previous = -1
  for (const strip of strips) {
    assert.ok(strip.y1 > previous, `strip starts must increase: ${strip.y1} after ${previous}`)
    assert.ok(strip.y2 - strip.y1 <= plan.stripHeight)
    previous = strip.y1
  }
  assert.equal(strips[strips.length - 1].y2, height, 'last strip must reach the bottom edge')
  assert.equal(strips[strips.length - 1].y1, height - plan.stripHeight, 'last strip anchored at bottom')
  for (const strip of strips) assert.equal(strip.count, strips.length)
})

test('mergeStrips drops the exact duplicated overlap lines', () => {
  const a = 'line 1\nline 2\nline 3\noverlap A\noverlap B'
  const b = 'overlap A\noverlap B\nline 4\nline 5'
  const merged = mergeStrips([a, b])
  assert.equal(merged, 'line 1\nline 2\nline 3\noverlap A\noverlap B\nline 4\nline 5')
})

test('mergeStrips keeps differing text (no fuzzy dedup)', () => {
  const a = 'header\nprice 12.00'
  const b = 'price 12.0O\nfooter' // O vs 0 differs -> nothing dropped
  const merged = mergeStrips([a, b])
  assert.equal(merged, 'header\nprice 12.00\nprice 12.0O\nfooter')
})

test('mergeStrips handles single-strip and empty transcripts', () => {
  assert.equal(mergeStrips(['only']), 'only')
  assert.equal(mergeStrips(['a\nb', '', 'c']), 'a\nb\n\nc')
})

test('unreadableStrip is an honest placeholder', () => {
  assert.equal(unreadableStrip(3), '[strip 3 unreadable]')
})
