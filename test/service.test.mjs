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

test('apply registers exactly the three v1 tools', () => {
  const { ctx, registeredTools } = stubContext({ withSkills: true })
  apply(ctx, config)
  assert.equal(name, 'dsh-vision')
  assert.deepEqual(registeredTools.map((tool) => tool.name).sort(), ['vision_map', 'vision_read', 'vision_zoom'])
  for (const tool of registeredTools) {
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
    assert.ok(typeof tool.description === 'string' && tool.description.length > 0)
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
