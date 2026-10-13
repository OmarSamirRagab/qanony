'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import type { ActionResult } from '@/lib/action'

/**
 * Generic note composer with an optional visibility selector. `submit` is a
 * server action bound by the caller.
 */
export function NoteComposer({
  placeholder,
  submitLabel,
  visibilityOptions,
  defaultVisibility,
  onSubmit,
  successMessage,
}: {
  placeholder: string
  submitLabel: string
  visibilityOptions?: { value: string; label: string }[]
  defaultVisibility?: string
  onSubmit: (body: string, visibility: string) => Promise<ActionResult>
  successMessage: string
}) {
  const te = useTranslations('errors')
  const router = useRouter()
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState(defaultVisibility ?? visibilityOptions?.[0]?.value ?? '')
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!body.trim()) return
        start(async () => {
          const res = await onSubmit(body, visibility)
          if (!res.ok) return void toast.error(res.detail ?? te(res.error))
          toast.success(successMessage)
          setBody('')
          router.refresh()
        })
      }}
    >
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={20000} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {visibilityOptions?.length ? (
          <div className="w-52">
            <NativeSelect value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="visibility" className="h-9">
              {visibilityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <Button type="submit" size="sm" loading={pending} disabled={!body.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
