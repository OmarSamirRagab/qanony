import { Mail } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/shared'
import { InvitationActions } from '@/features/firms/components/invitation-actions'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function InvitationsPage() {
  const ctx = await requireUser()
  const t = await getTranslations('firm.invitations')
  const te = await getTranslations('enums.memberType')
  const locale = await getLocale()
  const supabase = await createClient()
  await supabase.rpc('claim_firm_invitations')
  const { data } = await supabase.from('law_firm_members').select('id, member_type, firm:law_firms(name_ar, name_en)').eq('user_id', ctx.userId).eq('status', 'invited')
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {data?.length ? (
        <ul className="space-y-3">
          {data.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-soft">
              <div>
                <div className="font-bold">{m.firm ? pick(locale, m.firm.name_ar, m.firm.name_en) : ''}</div>
                <div className="text-sm text-muted-foreground">{t('as', { type: te(m.member_type) })}</div>
              </div>
              <InvitationActions memberId={m.id} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Mail} title={t('empty')} />
      )}
    </>
  )
}
