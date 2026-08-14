import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { VisualMemory, RegistryError, REGISTRY_CAP } from '../lib/registry.js'

const dir = join(process.cwd(), 'test', 'tmp')
mkdirSync(dir, { recursive: true })
const imagePath = join(dir, 'shot.png')
writeFileSync(imagePath, 'placeholder')

test('store then resolve by bare id against the latest map', () => {
  const memory = new VisualMemory()
  const entry = memory.store(imagePath, 'shot.png', 800, 600, [
    { id: 1, label: 'button A', norm: { x1: 0, y1: 0, x2: 500, y2: 200 } },
    { id: 2, label: 'button B', norm: { x1: 500, y1: 0, x2: 1000, y2: 200 } },
  ])
  assert.equal(entry.imageId, 'shot.png')
  const { region, box } = memory.resolve(imagePath, '2')
  assert.equal(region.label, 'button B')
  assert.deepEqual(box, { x1: 400, y1: 0, x2: 800, y2: 120 })
})

test('resolve with id@imageId form', () => {
  const memory = new VisualMemory()
  memory.store(imagePath, 'shot.png', 800, 600, [{ id: 7, label: 'x', norm: { x1: 0, y1: 0, x2: 100, y2: 100 } }])
  const result = memory.resolve(imagePath, '7@shot.png')
  assert.equal(result.region.id, 7)
})

test('id@imageId mismatch is rejected', () => {
  const memory = new VisualMemory()
  memory.store(imagePath, 'shot.png', 800, 600, [{ id: 1, label: 'x', norm: { x1: 0, y1: 0, x2: 100, y2: 100 } }])
  assert.throws(() => memory.resolve(imagePath, '1@other.png'), RegistryError)
})

test('missing map or unknown id gives actionable errors', () => {
  const memory = new VisualMemory()
  assert.throws(() => memory.resolve(imagePath, '1'), RegistryError)
  memory.store(imagePath, 'shot.png', 800, 600, [{ id: 1, label: 'x', norm: { x1: 0, y1: 0, x2: 100, y2: 100 } }])
  assert.throws(() => memory.resolve(imagePath, '99'), RegistryError)
  assert.throws(() => memory.resolve(imagePath, 'banana'), RegistryError)
})

test('a changed file invalidates the entry (new image, new map)', () => {
  const memory = new VisualMemory()
  memory.store(imagePath, 'shot.png', 800, 600, [{ id: 1, label: 'x', norm: { x1: 0, y1: 0, x2: 100, y2: 100 } }])
  writeFileSync(imagePath, 'changed content, different size than before')
  assert.throws(() => memory.resolve(imagePath, '1'), RegistryError)
})

test('LRU cap evicts the oldest entry', () => {
  const memory = new VisualMemory()
  for (let i = 0; i < REGISTRY_CAP + 2; i++) {
    const path = join(dir, `shot-${i}.png`)
    writeFileSync(path, `image ${i}`)
    memory.store(path, `shot-${i}.png`, 100, 100, [{ id: 1, label: 'x', norm: { x1: 0, y1: 0, x2: 100, y2: 100 } }])
  }
  assert.equal(memory.size, REGISTRY_CAP)
  // The newest entry still resolves; the oldest two were evicted.
  const newest = join(dir, `shot-${REGISTRY_CAP + 1}.png`)
  const result = memory.resolve(newest, '1')
  assert.equal(result.imageId, `shot-${REGISTRY_CAP + 1}.png`)
})

test('cleanup', () => {
  rmSync(dir, { recursive: true, force: true })
})
