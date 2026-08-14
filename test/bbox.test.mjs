import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseElements, parseRegion, positionLabel, BboxError } from '../lib/bbox.js'

const view = { width: 800, height: 600 }

test('parses a clean fenced JSON elements reply', () => {
  const reply = '```json\n{"elements": [{"label": "button Send", "x1": 100, "y1": 200, "x2": 300, "y2": 260},"x2": 1]}\n```'
  const parsed = parseElements('```json\n{"elements": [{"label": "button Send", "x1": 100, "y1": 200, "x2": 300, "y2": 260}]}\n```', 30, view)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, 1)
  assert.equal(parsed[0].label, 'button Send')
  assert.deepEqual(parsed[0].norm, { x1: 100, y1: 200, x2: 300, y2: 260 })
})

test('accepts a top-level array and wrapper keys', () => {
  const array = parseElements('[{"label": "a", "x1": 0, "y1": 0, "x2": 100, "y2": 100}]', 30, view)
  assert.equal(array.length, 1)
  const wrapped = parseElements('{"items": [{"label": "a", "x1": 0, "y1": 0, "x2": 100, "y2": 100}]}', 30, view)
  assert.equal(wrapped.length, 1)
})

test('regex fallback parses unquoted keys and prose around them', () => {
  const reply = 'Here is what I found: {label: "send button", x1: 100, y1: 200, x2: 300, y2: 260} hope it helps'
  const parsed = parseElements(reply, 30, view)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].label, 'send button')
})

test('drops out-of-range, degenerate, and malformed boxes', () => {
  const reply = JSON.stringify({
    elements: [
      { label: 'fine', x1: 10, y1: 10, x2: 200, y2: 200 },
      { label: 'out of range', x1: -50, y1: 10, x2: 200, y2: 200 },
      { label: 'degenerate', x1: 10, y1: 10, x2: 11, y2: 200 },
      { label: 'not numbers', x1: 'x', y1: 10, x2: 200, y2: 200 },
      { label: 'missing key', x1: 10, y1: 10, x2: 200 },
    ],
  })
  const parsed = parseElements(reply, 30, view)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].label, 'fine')
})

test('deduplicates near-identical boxes by IoU, keeping the richer label', () => {
  const reply = JSON.stringify({
    elements: [
      { label: 'Send', x1: 100, y1: 100, x2: 300, y2: 260 },
      { label: 'button "Send message now"', x1: 102, y1: 101, x2: 298, y2: 258 },
    ],
  })
  const parsed = parseElements(reply, 30, view)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].label, 'button "Send message now"')
})

test('assigns harness ids in reading order and caps maxItems', () => {
  const reply = JSON.stringify({
    elements: [
      { label: 'bottom', x1: 0, y1: 500, x2: 100, y2: 600 },
      { label: 'top right', x1: 500, y1: 0, x2: 600, y2: 100 },
      { label: 'top left', x1: 0, y1: 0, x2: 100, y2: 100 },
      { label: 'extra', x1: 200, y1: 200, x2: 300, y2: 300 },
    ],
  })
  const parsed = parseElements(reply, 3, view)
  assert.equal(parsed.length, 3)
  assert.deepEqual(parsed.map((e) => e.label), ['top left', 'top right', 'extra'])
  assert.deepEqual(parsed.map((e) => e.id), [1, 2, 3])
})

test('throws a clear error on unparseable replies', () => {
  assert.throws(() => parseElements('nothing useful here at all', 30, view), BboxError)
})

test('parseRegion clamps, reorders, and rejects empty regions', () => {
  assert.deepEqual(parseRegion('500,400,100,200', 800, 600), { x1: 100, y1: 200, x2: 500, y2: 400 })
  assert.deepEqual(parseRegion('-50,100,9000,300', 800, 600), { x1: 0, y1: 100, x2: 800, y2: 300 })
  assert.throws(() => parseRegion('10,10,10,10', 800, 600), BboxError)
  assert.throws(() => parseRegion('1,2,3', 800, 600), BboxError)
})

test('positionLabel names quadrants', () => {
  assert.equal(positionLabel({ x1: 0, y1: 0, x2: 10, y2: 10 }, 300, 300), 'top-left')
  assert.equal(positionLabel({ x1: 290, y1: 290, x2: 300, y2: 300 }, 300, 300), 'bottom-right')
  assert.equal(positionLabel({ x1: 145, y1: 145, x2: 155, y2: 155 }, 300, 300), 'center')
})
