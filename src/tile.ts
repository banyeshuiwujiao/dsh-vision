// Deterministic strip tiling for tall pages (long screenshots, chat logs,
// receipts). A tall page shrunk to one upload destroys the text the task
// needs, so the page is cut top-to-bottom into full-width overlapping strips;
// each strip is sent to the vision model alone with its ordinal in the
// prompt, and the transcript is merged afterwards by exact-line overlap
// matching (never fuzzy — distinct text is never lost).

export interface Strip {
  index: number
  count: number
  y1: number
  y2: number
}

export interface TilePlan {
  strips: Strip[]
  stripHeight: number
  overlap: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Whether a page should be tiled for transcription. */
export function shouldTile(dims: { width: number; height: number }): boolean {
  return dims.height > 2400 && dims.height > 1.8 * dims.width
}

/** Plan horizontal strips for one page. The last strip anchors the bottom edge. */
export function planStrips(width: number, height: number): TilePlan {
  const stripHeight = clamp(Math.round(width * 1.25), 640, 1280)
  const overlap = Math.max(96, Math.round(stripHeight * 0.2))
  const step = stripHeight - overlap
  const strips: Strip[] = []
  if (height <= stripHeight + overlap) {
    strips.push({ index: 1, count: 1, y1: 0, y2: height })
    return { strips, stripHeight, overlap }
  }
  let index = 1
  const starts: number[] = []
  for (let start = 0; start <= height - stripHeight; start += step) starts.push(start)
  // Anchor the final strip at the bottom so the page's bottom edge is never cut.
  const last = height - stripHeight
  if (starts[starts.length - 1] !== last) starts.push(last)
  const seen = new Set<number>()
  for (const start of starts) {
    if (seen.has(start)) continue
    seen.add(start)
    strips.push({ index: index++, count: 0, y1: start, y2: Math.min(height, start + stripHeight) })
  }
  for (const strip of strips) strip.count = strips.length
  return { strips, stripHeight, overlap }
}

/**
 * Merge per-strip transcripts top-to-bottom. Consecutive strips overlap by
 * design; the merge finds the longest exact-line overlap (last k lines of the
 * previous strip == first k lines of the next) and drops the duplicated
 * prefix. Exact comparison only: lines that differ anywhere stay, so real
 * content is never removed.
 */
export function mergeStrips(transcripts: string[]): string {
  const parts: string[] = []
  for (let i = 0; i < transcripts.length; i++) {
    const current = transcripts[i] ?? ''
    if (i === 0) {
      parts.push(current)
      continue
    }
    const previous = parts[parts.length - 1] ?? ''
    const prevLines = previous.split('\n')
    const curLines = current.split('\n')
    let overlap = 0
    for (let k = Math.min(prevLines.length, curLines.length); k >= 1; k--) {
      let equal = true
      for (let j = 0; j < k; j++) {
        if (prevLines[prevLines.length - k + j] !== curLines[j]) {
          equal = false
          break
        }
      }
      if (equal) {
        overlap = k
        break
      }
    }
    parts.push(curLines.slice(overlap).join('\n'))
  }
  return parts.join('\n')
}

/** Placeholder for a strip whose call failed: honest, never fabricated. */
export function unreadableStrip(index: number): string {
  return `[strip ${index} unreadable]`
}
