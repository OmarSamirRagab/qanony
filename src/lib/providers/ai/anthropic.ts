import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Claude provider for the AI legal-productivity module.
 * - Model: AI_MODEL (default claude-opus-5-5).
 * - Server-side refusal fallback is enabled (`fallbacks: "default"`), so a
 *   safety decline on the primary model is retried on an appropriate model
 *   within the same call; a final `refusal` is surfaced to the user as such.
 * - Prompts and documents are never logged; only usage metadata is recorded.
 * Env: ANTHROPIC_API_KEY (required to enable the module).
 */
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5-5'

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

let client: Anthropic | undefined
function getClient() {
  client ??= new Anthropic()
  return client
}

export type AiContent = Anthropic.Beta.BetaContentBlockParam

export interface AiResult {
  status: 'ok' | 'refused' | 'truncated'
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

export async function runClaude(opts: { system: string; content: AiContent[]; effort?: 'low' | 'medium' | 'high' }): Promise<AiResult> {
  // Long documents can take a while; stream and collect the final message to avoid HTTP timeouts.
  const stream = getClient().beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: opts.effort ?? 'medium' },
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.content }],
  })
  const message = await stream.finalMessage()
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  return {
    status: message.stop_reason === 'refusal' ? 'refused' : message.stop_reason === 'max_tokens' ? 'truncated' : 'ok',
    text,
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}

export { Anthropic }
