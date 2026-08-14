// Wire-protocol parsing for the vision_map element inventory. The model is
// asked for `{"elements": [{"label", "x1","y1","x2","y2"}, ...]}` on a
// 0-1000 grid; the reply is parsed tolerantly (fenced code, wrapper keys,
// alternate conventions, regex fallback for unquoted keys), then cleaned:
// clamped, degenerate boxes dropped, near-duplicates merged by IoU, sorted
// into reading order, and assigned canonical ids by the HARNESS — the model
// never numbers anything, so ids are always dense, ordered, and stable.

import { normalizedAdapter, type NormBox } from './coords.js'

export interface ParsedElement {
  id: number
  label: string
  /** Verbatim visible text, when the model reported one. */
  text?: string
  /** Model's self-reported certainty (0-1), when reported. */
  confidence?: number
  /** 0-1000 of the model's view space. */
  norm: NormBox
}

export class BboxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BboxError'
  }
}

const WRAPPER_KEYS = ['elements', 'items', 'objects', 'results'] as const
const BOX_KEYS = ['x1', 'y1', 'x2', 'y2'] as const
const LABEL_KEYS = ['label', 'caption', 'description', 'text'] as const

function stripFences(text: string): string {
  const cleaned = text.trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/gi)
  return (fenced ? fenced[fenced.length - 1] : cleaned).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
}

/** Fallback for replies that are almost JSON (unquoted keys, prose around). */
function parseFallback(text: string): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = []
  const objectPattern = /\{[^{}]*["']?(?:label|caption)["']?\s*:\s*["'][^"']+["'][^{}]*["']?(?:x1)["']?\s*:\s*-?\d+[^{}]*\}/g
  for (const block of text.matchAll(objectPattern)) {
    const chunk = block[0]
    const labelMatch = chunk.match(/["']?(?:label|caption)["']?\s*:\s*["']([^"']+)["']/)
    if (!labelMatch) continue
    // Coordinate values only: numbers that follow a colon AFTER the label.
    // (Matching bare digits would also catch the "1"/"2" inside x1/y2 keys.)
    const tail = chunk.slice((labelMatch.index ?? 0) + labelMatch[0].length)
    const numbers = [...tail.matchAll(/:\s*(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]))
    if (numbers.length < 4) continue
    items.push({ label: labelMatch[1], x1: numbers[numbers.length - 4], y1: numbers[numbers.length - 3], x2: numbers[numbers.length - 2], y2: numbers[numbers.length - 1] })
  }
  return items
}

function extractItems(text: string): unknown[] | null {
  const cleaned = stripFences(text)
  try {
    const payload: unknown = JSON.parse(cleaned)
    if (Array.isArray(payload)) return payload
    if (payload !== null && typeof payload === 'object') {
      for (const key of WRAPPER_KEYS) {
        const value = (payload as Record<string, unknown>)[key]
        if (Array.isArray(value)) return value
      }
    }
  } catch {
    // fall through to the tolerant pass
  }
  const fallback = parseFallback(cleaned)
  return fallback.length > 0 ? fallback : null
}

const MIN_NORM_SPAN = 5 // boxes narrower than 0.5% of the view are noise

function iou(a: NormBox, b: NormBox): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1))
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
  const intersection = ix * iy
  if (intersection === 0) return 0
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  return intersection / (areaA + areaB - intersection)
}

/**
 * Parse the model reply into cleaned, deduplicated, reading-order-sorted,
 * harness-numbered elements.
 * @param viewDims - the model view size (after preprocessing), used to
 *   validate spans against the wire grid.
 */
export function parseElements(text: string, maxItems: number, viewDims: { width: number; height: number }): ParsedElement[] {
  const items = extractItems(text)
  if (items === null) throw new BboxError('vision API did not return a parseable element inventory')
  const view = { viewBox: { x1: 0, y1: 0, x2: viewDims.width, y2: viewDims.height }, viewDims }
  const cleaned: Array<{ label: string; text?: string; confidence?: number; norm: NormBox }> = []
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const rawBox = BOX_KEYS.every((key) => key in record) ? [record.x1, record.y1, record.x2, record.y2] : record
    const norm = normalizedAdapter.toNorm(rawBox, view)
    if (!norm) continue
    const spanX = norm.x2 - norm.x1
    const spanY = norm.y2 - norm.y1
    if (spanX < MIN_NORM_SPAN || spanY < MIN_NORM_SPAN) continue
    if (norm.x1 < 0 || norm.y1 < 0 || norm.x2 > 1000 || norm.y2 > 1000) continue
    const rawLabel = LABEL_KEYS.map((key) => record[key]).find((value): value is string => typeof value === 'string')
    const label = (rawLabel ?? 'unclear element').trim().replace(/\s+/g, ' ')
    if (!label) continue
    const rawText = typeof record.text === 'string' ? record.text.trim().replace(/\s+/g, ' ') : undefined
    const rawConfidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence) ? Math.max(0, Math.min(1, record.confidence)) : undefined
    // IoU dedup: near-duplicate boxes merge, keeping the more informative label.
    const duplicate = cleaned.find((existing) => iou(existing.norm, norm) >= 0.85)
    if (duplicate) {
      if (label.length > duplicate.label.length) duplicate.label = label
      if (rawText && (!duplicate.text || rawText.length > duplicate.text.length)) duplicate.text = rawText
      if (rawConfidence !== undefined && (duplicate.confidence === undefined || rawConfidence > duplicate.confidence)) duplicate.confidence = rawConfidence
      continue
    }
    cleaned.push({ label, norm, ...(rawText !== undefined ? { text: rawText } : {}), ...(rawConfidence !== undefined ? { confidence: rawConfidence } : {}) })
  }
  // Reading order: top-to-bottom, then left-to-right by box center.
  cleaned.sort((a, b) => {
    const ay = (a.norm.y1 + a.norm.y2) / 2
    const by = (b.norm.y1 + b.norm.y2) / 2
    if (Math.abs(ay - by) > 20) return ay - by
    return (a.norm.x1 + a.norm.x2) / 2 - (b.norm.x1 + b.norm.x2) / 2
  })
  return cleaned.slice(0, maxItems).map((element, index) => ({ id: index + 1, ...element }))
}

/** Parse a "X1,Y1,X2,Y2" pixel box string, clamped into the image bounds. */
export function parseRegion(region: string, width: number, height: number): { x1: number; y1: number; x2: number; y2: number } {
  const parts = region.split(',').map((value) => Number(value.trim()))
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new BboxError('region expects four integers: X1,Y1,X2,Y2')
  }
  let [x1, y1, x2, y2] = parts.map(Math.round)
  if (x1 > x2) [x1, x2] = [x2, x1]
  if (y1 > y2) [y1, y2] = [y2, y1]
  x1 = Math.max(0, Math.min(width, x1))
  y1 = Math.max(0, Math.min(height, y1))
  x2 = Math.max(0, Math.min(width, x2))
  y2 = Math.max(0, Math.min(height, y2))
  if (x2 <= x1 || y2 <= y1) throw new BboxError(`region is empty after clamping to ${width}x${height}`)
  return { x1, y1, x2, y2 }
}

/** Coarse position label from the box center, for inventory readability. */
export function positionLabel(box: { x1: number; y1: number; x2: number; y2: number }, width: number, height: number): string {
  const cx = (box.x1 + box.x2) / 2
  const cy = (box.y1 + box.y2) / 2
  const third = 1 / 3
  const vertical = cy < height * third ? 'top' : cy < height * (1 - third) ? 'middle' : 'bottom'
  const horizontal = cx < width * third ? 'left' : cx < width * (1 - third) ? 'center' : 'right'
  return vertical === 'middle' ? (horizontal === 'center' ? 'center' : `${horizontal}-center`) : `${vertical}-${horizontal}`
}
