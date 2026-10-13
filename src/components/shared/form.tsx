'use client'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/** Label + control + localised error (error is an errors.json key). */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
  className,
  required,
}: {
  id: string
  label: React.ReactNode
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
  required?: boolean
}) {
  const t = useTranslations('errors')
  let message: string | undefined
  if (error) {
    try {
      message = t(error as 'required', { min: 20, max: 4000 })
    } catch {
      message = error
    }
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ms-0.5 text-destructive" aria-hidden>*</span> : null}
      </Label>
      {children}
      {hint && !message ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  )
}
