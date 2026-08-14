// dsh-vision: a visual working memory for DeepSeek Harness agents.
//
// One cordis service row registers three tools on the host `tools` registry:
//   vision_map        annotate an image into a numbered element inventory
//                     kept in visual working memory (the signature tool)
//   vision_read       ask questions about images, or extract all visible
//                     text verbatim (tall pages tiled and merged)
//   vision_zoom       inspect one region at full resolution (coarse-to-fine)
//
// Images come from the user (an uploaded attachment or a file path in the
// message) — the plugin never captures anything on its own.
// and registers the `visual-memory` skill when a skills service exists.
// The vision sidecar is any OpenAI-compatible multimodal endpoint; each
// task can route to its own model. Design references: see REFERENCES.md.

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import Schema from '@deepseek-ai/schemastery'
import { VisualMemory } from './registry.js'
import { buildTools } from './tools.js'
import { registerSkill } from './skill-loader.js'

export const name = 'dsh-vision'

export const inject = ['tools']

export interface Config {
  apiKey: string
  baseURL: string
  model: string
  modelMap: string
  modelRead: string
  modelZoom: string
  lang: string
  timeoutMs: number
  maxEdge: number
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().default(process.env.VISION_API_KEY ?? ''),
  baseURL: Schema.string().default(process.env.VISION_BASE_URL ?? ''),
  model: Schema.string().default(process.env.VISION_MODEL ?? ''),
  modelMap: Schema.string().default(process.env.VISION_MODEL_MAP ?? ''),
  modelRead: Schema.string().default(process.env.VISION_MODEL_READ ?? ''),
  modelZoom: Schema.string().default(process.env.VISION_MODEL_ZOOM ?? ''),
  lang: Schema.string().default(process.env.VISION_LANG ?? 'zh'),
  timeoutMs: Schema.number().default(180000),
  maxEdge: Schema.number().default(2048),
})

export function apply(ctx: Context, config: Config) {
  const memory = new VisualMemory()
  const tools = buildTools({
    vision: {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      modelMap: config.modelMap,
      modelRead: config.modelRead,
      modelZoom: config.modelZoom,
      modelCheck: '',
      lang: config.lang,
      timeoutMs: config.timeoutMs,
    },
    memory,
    maxEdge: config.maxEdge,
  })
  for (const tool of tools) ctx.tools.register(tool)
  registerSkill(ctx)
}
