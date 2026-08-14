import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, name } from '../lib/index.js'

function stubContext({ withSkills }) {
  const registeredTools = []
  const registeredSkills = []
  const ctx = {
    tools: { register: (tool) => registeredTools.push(tool) },
  }
  if (withSkills) ctx.skills = { register: (skill) => registeredSkills.push(skill) }
  return { ctx, registeredTools, registeredSkills }
}

const config = {
  apiKey: '',
  baseURL: '',
  model: '',
  modelMap: '',
  modelRead: '',
  modelZoom: '',
  lang: 'zh',
  timeoutMs: 180000,
  maxEdge: 2048,
}

test('apply registers exactly the five v1.1 tools', () => {
  const { ctx, registeredTools } = stubContext({ withSkills: true })
  apply(ctx, config)
  assert.equal(name, 'dsh-vision')
  assert.deepEqual(registeredTools.map((tool) => tool.name).sort(), ['vision_check', 'vision_diff', 'vision_map', 'vision_read', 'vision_zoom'])
  const validArgs = {
    vision_map: { image: 'x.png' },
    vision_read: { images: ['x.png'], mode: 'ask', question: 'q' },
    vision_zoom: { image: 'x.png', question: 'q', ref: '1' },
    vision_check: { image: 'x.png', claims: ['a'] },
    vision_diff: { a: 'a.png', b: 'b.png' },
  }
  for (const tool of registeredTools) {
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
    assert.ok(typeof tool.description === 'string' && tool.description.length > 0)
    // vision_map writes the shared registry and stays exclusive; the rest are read-only.
    if (tool.name === 'vision_map') {
      assert.equal(tool.isConcurrencySafe, undefined, 'vision_map must NOT opt into concurrency')
    } else {
      assert.equal(tool.isConcurrencySafe(validArgs[tool.name]), true, `${tool.name} must be concurrency-safe`)
    }
  }
})

test('apply registers the visual-memory skill when skills exist', () => {
  const { ctx, registeredSkills } = stubContext({ withSkills: true })
  apply(ctx, config)
  assert.equal(registeredSkills.length, 1)
  assert.equal(registeredSkills[0].name, 'visual-memory')
  assert.ok(registeredSkills[0].content.includes('vision_map'))
})

test('apply does not throw without a skills service', () => {
  const { ctx } = stubContext({ withSkills: false })
  assert.doesNotThrow(() => apply(ctx, config))
})
