'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label, Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import { saveSetting } from '../actions'

/** JSON editor for one platform setting; `settingKey` empty = create a new key. */
export function SettingEditor({ settingKey, value, isPublic, disabled }: { settingKey?: string; value?: unknown; isPublic?: boolean; disabled?: boolean }) {
  const t = useTranslations('admin.settings')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [key, setKey] = useState(settingKey ?? '')
  const [json, setJson] = useState(value === undefined ? '' : JSON.stringify(value, null, 2))
  const [pub, setPub] = useState(isPublic ?? false)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const id = `st-${settingKey ?? 'new'}`
  const validJson = (() => {
    try {
      JSON.parse(json)
      return true
    } catch {
      return false
    }
  })()
  return (
    <div className="space-y-3">
      {settingKey ? null : (
        <FormField id={`${id}-key`} label={t('key')} required>
          <Input id={`${id}-key`} dir="ltr" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="feature_flag" />
        </FormField>
      )}
      <FormField id={`${id}-v`} label={t('value')} error={error ?? (json && !validJson ? 'invalidJson' : undefined)}>
        <Textarea id={`${id}-v`} dir="ltr" rows={Math.min(14, Math.max(3, json.split('\n').length))} className="font-mono text-xs" value={json} disabled={disabled} onChange={(e) => setJson(e.target.value)} />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id={`${id}-pub`} checked={pub} disabled={disabled} onCheckedChange={setPub} />
          <Label htmlFor={`${id}-pub`}>{t('public')}</Label>
        </div>
        <Button
          size="sm"
          disabled={disabled || !validJson || !/^[a-z_]+$/.test(key)}
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await saveSetting(key, json, pub)
              if (!res.ok) {
                setError(res.fieldErrors?.valueJson)
                return void toast.error(res.detail ?? terr(res.fieldErrors?.valueJson ? 'invalidJson' : res.error))
              }
              setError(undefined)
              toast.success(t('saved'))
              if (!settingKey) {
                setKey('')
                setJson('')
              }
              router.refresh()
            })
          }
        >
          {tc('save')}
        </Button>
      </div>
    </div>
  )
}
