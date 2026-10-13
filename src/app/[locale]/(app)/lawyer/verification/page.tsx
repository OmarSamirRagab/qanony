import { BadgeCheck, FileText } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Badge } from '@/components/ui/card'
import { AddCredentialForm, SubmitVerificationForm } from '@/features/lawyer-portal/components/verification-forms'
import { requirePortal } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function VerificationPage() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('dashboard.verification')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: lawyer }, { data: creds }, { data: requests }, { data: priv }] = await Promise.all([
    supabase.from('lawyer_profiles').select('verification_status').eq('id', ctx.userId).single(),
    supabase.from('lawyer_credentials').select('id, kind, title, issuer, issued_on, is_verified, is_public, document_id').eq('lawyer_id', ctx.userId).order('created_at'),
    supabase.from('lawyer_verification_requests').select('status, decision_reason, created_at, reviewed_at').eq('lawyer_id', ctx.userId).order('created_at', { ascending: false }).limit(1),
    supabase.from('lawyer_private_details').select('bar_registration_number').eq('lawyer_id', ctx.userId).maybeSingle(),
  ])
  const status = lawyer?.verification_status ?? 'unverified'
  const last = requests?.[0]
  const canSubmit = status === 'unverified' || status === 'rejected'
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<StatusBadge status={status} label={te(`verification.${status}`)} className="text-sm" />} />
      {status === 'pending' ? <Notice tone="info" className="mb-6" title={t('pendingBody')} /> : null}
      {status === 'verified' ? <Notice tone="gold" className="mb-6" title={t('verifiedBody')} /> : null}
      {status === 'suspended' ? <Notice tone="danger" className="mb-6" title={t('suspendedBody')} /> : null}
      {status === 'rejected' && last?.decision_reason ? <Notice tone="warning" className="mb-6" title={t('rejectedBody', { reason: last.decision_reason })} /> : null}
      <div className="space-y-6">
        <Section title={t('credentials')} description={t('privacyNote')}>
          <ul className="mb-5 space-y-2">
            {(creds ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                <FileText className="size-4 text-gold" aria-hidden />
                <span className="font-semibold">{c.title}</span>
                <span className="text-muted-foreground">
                  {te(`credentialKind.${c.kind as 'other'}`)} {c.issuer ? `· ${c.issuer}` : ''} {c.issued_on ? `· ${formatDate(c.issued_on, locale)}` : ''}
                </span>
                {c.is_verified ? (
                  <Badge variant="success">
                    <BadgeCheck aria-hidden /> {te('verification.verified')}
                  </Badge>
                ) : null}
                {c.document_id ? (
                  <a href={`/api/documents/${c.document_id}/download`} className="ms-auto text-xs font-semibold text-gold">
                    {tc('download')}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <AddCredentialForm />
        </Section>
        {canSubmit ? (
          <Section title={t('submit')}>
            <SubmitVerificationForm credentials={(creds ?? []).filter((c) => c.document_id).map((c) => ({ id: c.id, title: c.title }))} defaultBar={priv?.bar_registration_number ?? ''} />
          </Section>
        ) : null}
      </div>
    </>
  )
}
