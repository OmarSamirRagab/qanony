'use client'
import { NativeSelect } from '@/components/ui/input'

/** Select that submits its parent GET form on change (progressive enhancement). */
export function AutoSubmitSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
