import type { z } from 'zod'
import { mapDbError, type DbErrorLike, type ErrorKey } from '@/lib/errors'

/** Uniform result for Server Actions consumed by client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorKey; detail?: string; fieldErrors?: Record<string, string> }

export function ok<T>(data: T): ActionResult<T>
export function ok(): ActionResult<undefined>
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data }
}

export function fail(error: ErrorKey, detail?: string): ActionResult<never> {
  return { ok: false, error, detail }
}

export function fromDb(error: DbErrorLike): ActionResult<never> {
  const key = mapDbError(error)
  if (key === 'unknown') {
    // Validation errors raised by RPCs (22023) carry a safe, descriptive message.
    if (error.code === '22023' || error.code === 'P0001') return { ok: false, error: key, detail: error.message }
    console.error('[db]', error.code, error.message)
  }
  return { ok: false, error: key }
}

/**
 * Validates input with a zod schema whose messages are i18n keys from
 * errors.json, returning field errors keyed by path.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): { data: z.infer<S> } | { result: ActionResult<never> } {
  const parsed = schema.safeParse(input)
  if (parsed.success) return { data: parsed.data }
  const fieldErrors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || '_'
    fieldErrors[key] ??= issue.message
  }
  return { result: { ok: false, error: 'required', fieldErrors } }
}
