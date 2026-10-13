'use server'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action'
import { hasFeature, type Entitlements } from '@/lib/domain/entitlements'
import { AI_MODEL, isAiConfigured, runClaude, type AiContent } from '@/lib/providers/ai/anthropic'
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { CLIENT_ASSISTANT_PROMPT, LAWYER_TOOL_PROMPT, TASK_INSTRUCTIONS } from './prompts'

type AiOutcome = { status: 'ok' | 'refused' | 'truncated'; text: string; categories?: string[] }
const HOURLY_LIMIT = 30

async function context() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  return { supabase, userId: auth.user?.id ?? null }
}

/** Metadata-only audit of AI use (never prompt/document content). */
async function logUsage(row: { user_id: string; feature: string; status: 'ok' | 'error' | 'blocked' | 'unavailable'; matter_id?: string | null; document_id?: string | null; input_tokens?: number; output_tokens?: number; error_code?: string }) {
  if (!isServiceRoleConfigured()) return
  await createAdminClient().from('ai_usage_logs').insert({ provider: 'anthropic', model: AI_MODEL, ...row })
}

async function preflight(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<ActionResult<never> | null> {
  if (!isAiConfigured()) return fail('notConfigured')
  const { data: setting } = await supabase.from('platform_settings').select('value').eq('key', 'ai').maybeSingle()
  if ((setting?.value as { enabled?: boolean } | null)?.enabled === false) return fail('notConfigured')
  const { data: settings } = await supabase.from('user_settings').select('ai_enabled').eq('user_id', userId).maybeSingle()
  if (settings && !settings.ai_enabled) return fail('forbidden')
  const { count } = await supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
  if ((count ?? 0) >= HOURLY_LIMIT) return fail('rateLimited')
  return null
}

const askSchema = z.object({ question: z.string().trim().min(5).max(4000) })

/** Public legal-information assistant (signed-in users; no documents). */
export async function askAssistant(question: string): Promise<ActionResult<AiOutcome>> {
  const parsed = askSchema.safeParse({ question })
  if (!parsed.success) return fail('required')
  const { supabase, userId } = await context()
  if (!userId) return fail('unauthenticated')
  const blocked = await preflight(supabase, userId)
  if (blocked) return blocked
  try {
    const r = await runClaude({ system: CLIENT_ASSISTANT_PROMPT, content: [{ type: 'text', text: parsed.data.question }], effort: 'low' })
    await logUsage({ user_id: userId, feature: 'client_assistant', status: r.status === 'refused' ? 'blocked' : 'ok', input_tokens: r.inputTokens, output_tokens: r.outputTokens })
    const match = r.text.match(/CATEGORIES:\s*(.+)\s*$/i)
    const categories = match && !/none/i.test(match[1]!) ? match[1]!.split(',').map((s) => s.trim()).filter((s) => /^[a-z-]+$/.test(s)).slice(0, 3) : []
    return ok({ status: r.status, text: r.text.replace(/CATEGORIES:.*$/i, '').trim(), categories })
  } catch (e) {
    console.error('[ai] assistant error', e instanceof Error ? e.name : 'unknown')
    await logUsage({ user_id: userId, feature: 'client_assistant', status: 'error', error_code: e instanceof Error ? e.name : 'unknown' })
    return fail('providerUnavailable')
  }
}

const toolSchema = z.object({
  task: z.enum(['summarize', 'clauses', 'compare', 'draft', 'meeting', 'timeline']),
  documentIds: z.array(z.uuid()).max(2).default([]),
  matterId: z.uuid().nullish(),
  instructions: z.string().trim().max(8000).default(''),
})

/**
 * Lawyer productivity tools. Gates, all enforced server-side:
 * plan feature `ai.tools`; lawyer, firm and matter AI switches; the uploader's
 * explicit consent and per-document opt-in; RLS-checked access to each document.
 */
export async function runLawyerTool(input: z.input<typeof toolSchema>): Promise<ActionResult<AiOutcome>> {
  const parsed = toolSchema.safeParse(input)
  if (!parsed.success) return fail('required')
  const { task, documentIds, matterId, instructions } = parsed.data
  const { supabase, userId } = await context()
  if (!userId) return fail('unauthenticated')
  const blocked = await preflight(supabase, userId)
  if (blocked) return blocked

  const { data: ent } = await supabase.rpc('my_entitlements', {})
  if (!hasFeature(ent as unknown as Entitlements, 'ai.tools')) return fail('planLimit')
  const { data: lawyer } = await supabase.from('lawyer_profiles').select('ai_enabled').eq('id', userId).maybeSingle()
  if (!lawyer || !lawyer.ai_enabled) return fail('forbidden')
  if (task === 'compare' && documentIds.length !== 2) return fail('required')
  if (['summarize', 'clauses'].includes(task) && documentIds.length < 1) return fail('required')

  const content: AiContent[] = []
  let timelineText = ''
  if (matterId) {
    const { data: matter } = await supabase.from('legal_matters').select('id, title, ai_enabled, firm:law_firms(ai_enabled)').eq('id', matterId).maybeSingle()
    if (!matter || !matter.ai_enabled || matter.firm?.ai_enabled === false) {
      await logUsage({ user_id: userId, feature: `lawyer_${task}`, status: 'blocked', matter_id: matterId, error_code: 'matter_ai_disabled' })
      return fail('forbidden')
    }
    if (task === 'timeline') {
      const { data: events } = await supabase.from('matter_events').select('summary, occurred_at, event_type').eq('matter_id', matterId).order('occurred_at').limit(300)
      timelineText = (events ?? []).map((e) => `${e.occurred_at.slice(0, 10)} — ${e.summary}`).join('\n')
    }
  }

  const admin = isServiceRoleConfigured() ? createAdminClient() : null
  for (const id of documentIds) {
    // RLS: the lawyer must be able to see the document at all.
    const { data: doc } = await supabase.from('documents').select('id, title, mime_type, ai_processing_allowed, owner_id, scan_status, firm:law_firms(ai_enabled)').eq('id', id).maybeSingle()
    if (!doc || doc.scan_status === 'infected') return fail('notFound')
    if (!doc.ai_processing_allowed || doc.firm?.ai_enabled === false) {
      await logUsage({ user_id: userId, feature: `lawyer_${task}`, status: 'blocked', document_id: id, error_code: 'document_ai_not_allowed' })
      return { ok: false, error: 'forbidden', detail: 'document_ai_not_allowed' }
    }
    const { data: ownerSettings } = admin ? await admin.from('user_settings').select('ai_document_consent_at').eq('user_id', doc.owner_id).maybeSingle() : { data: null }
    if (!ownerSettings?.ai_document_consent_at) {
      await logUsage({ user_id: userId, feature: `lawyer_${task}`, status: 'blocked', document_id: id, error_code: 'no_owner_consent' })
      return { ok: false, error: 'forbidden', detail: 'no_owner_consent' }
    }
    const { data: file, error } = await supabase.rpc('authorize_document_download', { p_document_id: id, p_version: null })
    if (error || !file || !admin) return fail('forbidden')
    const f = file as { bucket: string; path: string; mime_type: string }
    const { data: blob } = await admin.storage.from(f.bucket).download(f.path)
    if (!blob) return fail('notFound')
    const bytes = Buffer.from(await blob.arrayBuffer())
    if (f.mime_type === 'application/pdf') {
      content.push({ type: 'document', title: doc.title, source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } })
    } else if (f.mime_type === 'text/plain') {
      content.push({ type: 'document', title: doc.title, source: { type: 'text', media_type: 'text/plain', data: bytes.toString('utf8') } })
    } else if (['image/jpeg', 'image/png', 'image/webp'].includes(f.mime_type)) {
      content.push({ type: 'image', source: { type: 'base64', media_type: f.mime_type as 'image/png', data: bytes.toString('base64') } })
    } else {
      return { ok: false, error: 'invalidFile', detail: 'unsupported_type' }
    }
    await admin.from('document_access_log').insert({ document_id: id, user_id: userId, action: 'ai_process' })
  }

  const prompt = [TASK_INSTRUCTIONS[task], instructions && `Lawyer's instructions:\n${instructions}`, timelineText && `Matter events:\n${timelineText}`].filter(Boolean).join('\n\n')
  content.push({ type: 'text', text: prompt })
  try {
    const r = await runClaude({ system: LAWYER_TOOL_PROMPT, content, effort: task === 'draft' || task === 'compare' ? 'high' : 'medium' })
    await logUsage({
      user_id: userId,
      feature: `lawyer_${task}`,
      status: r.status === 'refused' ? 'blocked' : 'ok',
      matter_id: matterId ?? null,
      document_id: documentIds[0] ?? null,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
    })
    return ok({ status: r.status, text: r.text })
  } catch (e) {
    console.error('[ai] tool error', e instanceof Error ? e.name : 'unknown')
    await logUsage({ user_id: userId, feature: `lawyer_${task}`, status: 'error', error_code: e instanceof Error ? e.name : 'unknown' })
    return fail('providerUnavailable')
  }
}
