// Visual working memory: an in-memory registry of numbered regions per
// image. vision_map stores the numbered element list; follow-up calls
// (vision_zoom ref "7") resolve ids back to pixel boxes through this
// registry, so the text agent reasons about ids and never touches
// coordinates. Identity is file identity: a changed or replaced file is a
// different image, and ids never leak across captures.

import { realpathSync, statSync } from 'node:fs'
import type { NormBox, PxBox } from './coords.js'
import { normOfOriginalToPx } from './coords.js'

export interface RegistryRegion {
  id: number
  label: string
  /** Verbatim visible text, when the model reported one. */
  text?: string
  /** Model's self-reported certainty (0-1), when reported. */
  confidence?: number
  /** 0-1000 of the original image. */
  norm: NormBox
}

export interface RegistryEntry {
  key: string
  imageId: string
  width: number
  height: number
  regions: RegistryRegion[]
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryError'
  }
}

export const REGISTRY_CAP = 16

export class VisualMemory {
  private entries = new Map<string, RegistryEntry>()
  private order: string[] = []
  private latestKey: string | null = null

  /** File identity: the same path with changed content is a new image. */
  static identity(path: string): string {
    const real = realpathSync(path)
    const stat = statSync(path)
    return `${real}#${stat.mtimeMs}#${stat.size}`
  }

  store(imagePath: string, imageId: string, width: number, height: number, regions: RegistryRegion[]): RegistryEntry {
    const key = VisualMemory.identity(imagePath)
    const entry: RegistryEntry = { key, imageId, width, height, regions }
    this.entries.set(key, entry)
    this.order = this.order.filter((k) => k !== key)
    this.order.push(key)
    while (this.order.length > REGISTRY_CAP) {
      const evicted = this.order.shift()
      if (evicted) this.entries.delete(evicted)
    }
    this.latestKey = key
    return entry
  }

  /**
   * Resolve a reference string against an image path.
   * Forms: "7" (most recent map) or "7@imageId" (a specific map).
   */
  resolve(imagePath: string, ref: string): { region: RegistryRegion; box: PxBox; imageId: string } {
    const match = ref.match(/^(\d+)(?:@(.+))?$/)
    if (!match) throw new RegistryError(`invalid region reference "${ref}" — use the id from vision_map, e.g. "7" or "7@imageId"`)
    const id = Number(match[1])
    const imageId = match[2]
    const key = VisualMemory.identity(imagePath)
    let entry: RegistryEntry | undefined
    if (imageId) {
      entry = this.entries.get(key)
      if (entry && entry.imageId !== imageId) {
        throw new RegistryError(`reference "${ref}" does not belong to image "${imageId}" — it was mapped from a different file`)
      }
    } else {
      entry = this.entries.get(key)
      if (!entry && this.latestKey !== key) {
        throw new RegistryError('no registry entry for this image — call vision_map on it first')
      }
    }
    if (!entry) entry = this.latestKey ? this.entries.get(this.latestKey) : undefined
    if (!entry || entry.key !== key) {
      throw new RegistryError('registry entry expired (the file changed since vision_map) — call vision_map again')
    }
    const region = entry.regions.find((r) => r.id === id)
    if (!region) {
      throw new RegistryError(`no element with id ${id} in this map — valid ids are 1..${entry.regions.length}`)
    }
    return { region, box: normOfOriginalToPx(region.norm, { width: entry.width, height: entry.height }), imageId: entry.imageId }
  }

  get size(): number {
    return this.entries.size
  }
}
