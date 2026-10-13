import { Download, FileText } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Breadcrumbs } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { reviewVerification, setLawyerStatus } from '@/features/admin/actions'
import { PlacementForm } from '@/features/admin/components/placement-form'
import { ReasonAction } from '@/features/admin/components/reason-action'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatDate, formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function AdminVerificationDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminAccess('verification.review')
  if (!ctx) return <AccessDenied />
  const { id } = await params
  const t = await getTranslations('admin.verification')
  const tn = await getTranslations('nav.admin')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: req } = await supabase.from('lawyer_verification_requests').select('*').eq('id', id).maybeSingle()
  if (!req) notFound()
  const [{ data: lawyer }, { data: profile }, { data: credentials }, { data: history }] = await Promise.all([
    supabase.from('lawyer_profiles').select('*').eq('id', req.lawyer_id).single(),
    supabase.from('profiles').select('full_name, phone').eq('id', req.lawyer_id).single(),
    supabase.from('lawyer_credentials').select('*').eq('lawyer_id', req.lawyer_id).order('created_at'),
    supabase.from('lawyer_verification_requests').select('id, status, created_at, decision_reason').eq('lawyer_id', req.lawyer_id).neq('id', id).order('created_at', { ascending: false }),
  ])
  if (!lawyer) notFound()
  const pending = req.status === 'pending'
  async function approve(reason: string) {
    'use server'
    return reviewVerification(id, true, reason)
  }
  async function reject(reason: string) {
    'use server'
    return reviewVerification(id, false, reason)
  }
  async function suspend(reason: string) {
    'use server'
    return setLawyerStatus(req!.lawyer_id, 'suspended', reason)
  }
  async function reinstate(reason: string) {
    'use server'
    return setLawyerStatus(req!.lawyer_id, 'verified', reason)
  }
  const attached = new Set(req.credential_ids)
  return (
    <>
      <Breadcrumbs items={[{ label: tn('verification'), href: '/admin/verification' }, { label: lawyer.display_name_ar }]} />
      <PageHeader
        title={(locale === 'en' && lawyer.display_name_en) || lawyer.display_name_ar}
        description={profile?.full_name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={req.status} label={te(`verification.${req.status}`)} />
            {pending ? (
              <>
                <ReasonAction label={t('approve')} title={t('approve')} description={t('checklist')} fieldLabel={t('reason')} action={approve} success={t('decided')} variant="gold" />
                <ReasonAction label={t('reject')} title={t('reject')} fieldLabel={t('reason')} action={reject} success={t('decided')} variant="destructive" />
              </>
            ) : null}
          </div>
        }
      />
      {pending ? <Notice tone="info" className="mb-6" title={t('checklist')} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Section>
            <DescriptionList
              items={[
                { label: t('barNumber'), value: <span dir="ltr" className="font-mono">{req.bar_registration_number}</span> },
                { label: t('barLevel'), value: lawyer.bar_admission_level ? te(`barLevel.${lawyer.bar_admission_level as 'general'}`) : '—' },
                { label: tc('phone'), value: <span dir="ltr">{profile?.phone ?? '—'}</span> },
                { label: t('submitted'), value: formatDateTime(req.created_at, locale) },
                { label: t('note'), value: req.submitted_note || '—' },
                ...(req.decision_reason ? [{ label: t('decision'), value: req.decision_reason }] : []),
                {
                  label: t('lawyerStatus'),
                  value: <StatusBadge status={lawyer.verification_status} label={te(`verification.${lawyer.verification_status}`)} />,
                },
              ]}
            />
          </Section>
          <Section title={t('documents')}>
            {credentials?.length ? (
              <ul className="divide-y">
                {credentials.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {c.title} {attached.has(c.id) ? <Badge variant="gold">{t('attached')}</Badge> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {te(`credentialKind.${c.kind as 'bar_card'}`)}
                          {c.issuer ? ` · ${c.issuer}` : ''}
                          {c.expires_on ? ` · ${tc('to')} ${formatDate(c.expires_on, locale)}` : ''}
                        </div>
                      </div>
                    </div>
                    {c.document_id ? (
                      <a href={`/api/documents/${c.document_id}/download`} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-semibold hover:bg-muted" rel="noopener">
                        <Download className="size-3.5" aria-hidden /> {tc('download')}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{tc('noData')}</p>
            )}
          </Section>
          {history?.length ? (
            <Section title={t('history')}>
              <ul className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={h.status} label={te(`verification.${h.status}`)} />
                    <span className="text-muted-foreground">{formatDate(h.created_at, locale)}</span>
                    {h.decision_reason ? <span>— {h.decision_reason}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
        <aside className="space-y-6">
          <Section title={t('placement')}>
            <PlacementForm lawyerId={lawyer.id} featured={lawyer.is_featured} sponsoredUntil={lawyer.sponsored_until} />
          </Section>
          <Section>
            <div className="flex flex-wrap gap-2">
              {lawyer.is_published ? (
                <Link href={`/lawyers/${lawyer.slug}`} className="text-sm text-gold hover:underline">
                  /lawyers/{lawyer.slug}
                </Link>
              ) : null}
              {lawyer.verification_status === 'verified' ? (
                <ReasonAction label={t('suspendLawyer')} title={t('suspendLawyer')} fieldLabel={t('reason')} action={suspend} success={t('decided')} variant="destructive" />
              ) : null}
              {lawyer.verification_status === 'suspended' ? (
                <ReasonAction label={t('reinstate')} title={t('reinstate')} fieldLabel={t('reason')} action={reinstate} success={t('decided')} />
              ) : null}
            </div>
          </Section>
        </aside>
      </div>
    </>
  )
}
