// Load the packaged skill and register it on the skills service when one is
// present in the profile. The skill body lives in skills/visual-memory/
// SKILL.md; its frontmatter carries the name and description.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'

const SKILL_RELATIVE_PATH = ['..', 'skills', 'visual-memory', 'SKILL.md']

export function registerSkill(ctx: Context): void {
  try {
    const skills = ctx.skills as { register?: (skill: unknown) => void } | undefined
    if (typeof skills?.register !== 'function') return
    const skillPath = join(fileURLToPath(new URL('.', import.meta.url)), ...SKILL_RELATIVE_PATH)
    const content = readFileSync(skillPath, 'utf8')
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ''
    const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? 'visual-memory'
    const description = frontmatter
      .match(/^description:\s*>?\n?([\s\S]*?)(?=^\S|\z)/m)?.[1]
      ?.replaceAll('\n', ' ')
      .replace(/\s+/g, ' ')
      .trim() ?? 'Visual working memory for text-only agents.'
    skills.register({
      name,
      description,
      content: content.replace(/^---\n[\s\S]*?\n---\n/, ''),
    })
  } catch {
    // No skills service in this profile: the tool descriptions themselves
    // carry the workflow guidance, so the plugin still works.
  }
}
