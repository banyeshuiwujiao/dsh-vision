import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVerdicts } from '../lib/tools.js'
import { callVision, VisionError } from '../lib/vision-client.js'

test('parseVerdicts parses a clean fenced reply', () => {
  const reply = '```json\n{"verdicts": [{"claim": "the page shows a 404", "verdict": "supported", "reason": "404 is visible"}, {"claim": "the button is red", "verdict": "contradicted", "reason": "it is grey"}]}\n```'
  const verdicts = parseVerdicts(reply, ['the page shows a 404', 'the button is red'])
  assert.equal(verdicts.length, 2)
  assert.equal(verdicts[0].verdict, 'supported')
  assert.equal(verdicts[1].verdict, 'contradicted')
  assert.equal(verdicts[1].reason, 'it is grey')
})

test('parseVerdicts rejects invalid verdict values and pads missing claims', () => {
  const reply = '{"verdicts": [{"claim": "a", "verdict": "maybe", "reason": ""}, {"claim": "b", "verdict": "supported"}]}'
  const verdicts = parseVerdicts(reply, ['a', 'b', 'never mentioned'])
  // Invalid "maybe" row is dropped; unaddressed claims become honest unverifiable rows.
  assert.equal(verdicts.length, 3)
  assert.equal(verdicts[0].claim, 'b')
  assert.equal(verdicts[0].verdict, 'supported')
  assert.equal(verdicts[1].claim, 'a')
  assert.equal(verdicts[1].verdict, 'unverifiable')
  assert.equal(verdicts[2].claim, 'never mentioned')
  assert.equal(verdicts[2].verdict, 'unverifiable')
})

test('parseVerdicts handles unquoted-key prose via regex fallback', () => {
  const reply = 'results: {claim: "x exists", verdict: "supported", reason: "visible at top"}'
  const verdicts = parseVerdicts(reply, ['x exists'])
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].verdict, 'supported')
})

test('parseVerdicts throws on garbage', () => {
  assert.throws(() => parseVerdicts('nothing useful', ['a claim']), /parseable verdict/)
})

test('parseVerdicts never binds a claim-less verdict positionally', () => {
  // The worst failure mode: the model omits claim fields; a positional fallback
  // would "confirm" claims the model never evaluated.
  const reply = '{"verdicts": [{"verdict": "supported", "reason": "the grass is green"}]}'
  const verdicts = parseVerdicts(reply, ['the sky is red', 'the grass is green'])
  assert.equal(verdicts.length, 2)
  for (const verdict of verdicts) assert.equal(verdict.verdict, 'unverifiable')
  assert.deepEqual(verdicts.map((verdict) => verdict.claim).sort(), ['the grass is green', 'the sky is red'])
})

const config = {
  apiKey: 'k',
  baseURL: 'https://primary.test',
  model: 'primary-model',
  modelMap: '',
  modelRead: '',
  modelZoom: '',
  modelCheck: '',
  chain: [],
  lang: 'zh',
  timeoutMs: 5000,
}

test('fallback chain advances to the next endpoint on failure', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    if (String(url).includes('primary.test')) return { ok: false, status: 500, text: async () => 'boom' }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'fallback answer' } }] }) }
  }
  const answer = await callVision(
    { ...config, chain: [{ apiKey: 'k2', baseURL: 'https://fallback.test', model: 'free-model' }] },
    { task: 'read', prompt: 'hi', images: [{ dataUrl: 'data:image/png;base64,AA==' }], maxTokens: 100 },
  )
  assert.equal(answer, 'fallback answer')
  // 3 attempts on the primary (in-endpoint retries on 500), then the fallback.
  assert.equal(calls.length, 4)
  assert.ok(calls.slice(0, 3).every((url) => url.includes('primary.test')))
  assert.ok(calls[3].includes('fallback.test'))
})

test('fallback chain inherits the primary api key for keyless entries', async () => {
  let auth = ''
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('primary.test')) return { ok: false, status: 401, text: async () => 'nope' }
    auth = init.headers.Authorization
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
  }
  await callVision(
    { ...config, chain: [{ apiKey: '', baseURL: 'https://fallback.test', model: 'free-model' }] },
    { task: 'read', prompt: 'hi', images: [{ dataUrl: 'data:image/png;base64,AA==' }], maxTokens: 100 },
  )
  assert.equal(auth, 'Bearer k')
})

test('all endpoints failing aggregates the errors', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'dead' })
  await assert.rejects(
    () => callVision(config, { task: 'read', prompt: 'hi', images: [{ dataUrl: 'data:image/png;base64,AA==' }], maxTokens: 100 }),
    (error) => error instanceof VisionError && error.message.includes('all 1 vision endpoint(s) failed'),
  )
})
