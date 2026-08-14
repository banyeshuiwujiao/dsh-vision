// Task-routed OpenAI-compatible multimodal client.
//
// One vision sidecar, several jobs: each task (`map` / `read` / `zoom` /
// `check`) can route to its own model (a cheap one for transcription, a
// grounding-strong one for mapping), falling back to the primary model.
// Request policy follows the research-backed rules: temperature 0 for
// grounding and transcription, JSON mode without max_tokens (so output can
// never truncate mid-JSON), tolerant retry of transient failures, and API
// keys redacted from every error surface.

export type VisionTask = 'map' | 'read' | 'zoom' | 'check'

export interface VisionConfig {
  apiKey: string
  baseURL: string
  /** Primary model. */
  model: string
  /** Per-task overrides; empty means use the primary. */
  modelMap: string
  modelRead: string
  modelZoom: string
  modelCheck: string
  lang: string
  timeoutMs: number
}

export interface VisionImage {
  dataUrl: string
}

export interface VisionCallOptions {
  task: VisionTask
  prompt: string
  images: VisionImage[]
  /** Omitted entirely when jsonMode (truncated JSON is worse than none). */
  maxTokens?: number
  jsonMode?: boolean
  /** Force temperature 0 (grounding, transcription). */
  deterministic?: boolean
}

export class VisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisionError'
  }
}

const MODEL_BY_TASK: Record<VisionTask, 'modelMap' | 'modelRead' | 'modelZoom' | 'modelCheck'> = {
  map: 'modelMap',
  read: 'modelRead',
  zoom: 'modelZoom',
  check: 'modelCheck',
}

function resolveModel(config: VisionConfig, task: VisionTask): string {
  const override = config[MODEL_BY_TASK[task]]
  return override || config.model
}

function assertConfigured(config: VisionConfig, task: VisionTask): void {
  const model = resolveModel(config, task)
  const missing: string[] = []
  if (!config.apiKey) missing.push('VISION_API_KEY')
  if (!config.baseURL) missing.push('VISION_BASE_URL')
  if (!model) missing.push(`VISION_MODEL (or VISION_MODEL_${task.toUpperCase()})`)
  if (missing.length > 0) {
    throw new VisionError(`vision API is not configured for task "${task}"; set ${missing.join(' / ')} in the environment or the dsh-vision plugin config`)
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => (part !== null && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string' ? (part as Record<string, string>).text : ''))
      .join('\n')
      .trim()
  }
  return ''
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

export async function callVision(config: VisionConfig, options: VisionCallOptions): Promise<string> {
  assertConfigured(config, options.task)
  const baseURL = config.baseURL.replace(/\/+$/, '')
  const model = resolveModel(config, options.task)
  const useJsonMode = options.jsonMode === true
  const temperature = useJsonMode || options.deterministic === true || options.task === 'map' || options.task === 'check' ? 0 : undefined
  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: options.prompt },
          ...options.images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } })),
        ],
      },
    ],
  }
  if (temperature !== undefined) payload.temperature = temperature
  if (!useJsonMode && options.maxTokens !== undefined) payload.max_tokens = options.maxTokens

  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }
    if (useJsonMode && attempt < 1) payload.response_format = { type: 'json_object' }
    else delete payload.response_format
    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs),
      })
      if (!response.ok) {
        // Some endpoints reject response_format outright: retry once without it.
        if (response.status === 400 && useJsonMode && payload.response_format !== undefined && attempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          continue
        }
        const body = (await response.text()).slice(0, 400).replace(/\r/g, ' ').replace(/\n/g, ' ').replaceAll(config.apiKey, '<redacted>')
        if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
          continue
        }
        throw new VisionError(`vision API HTTP ${response.status}: ${body}`)
      }
      const data: unknown = await response.json()
      const record = data as { choices?: Array<{ message?: { content?: unknown } }> }
      const answer = contentText(record.choices?.[0]?.message?.content)
      if (!answer) throw new VisionError('vision API returned an empty answer')
      return answer
    } catch (error) {
      if (error instanceof VisionError) throw error
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
        continue
      }
      const reason = error instanceof Error ? error.message : String(error)
      throw new VisionError(`vision API network error: ${reason}`)
    }
  }
}
