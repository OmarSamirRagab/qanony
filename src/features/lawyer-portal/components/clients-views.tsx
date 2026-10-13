import { BadgeCheck, Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Breadcrumbs } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ClientDialog } from './client-dialog'

export async function ClientsListView({ scope, userId, firmId, q }: { scope: 'lawyer' | 'firm'; userId: string; firmId?: string; q?: string }) {
  const t = await getTranslations('dashboard.clients')
  const te = await getTranslations('enums.clientType')
  const locale = toLocale(await getLocale())
  const supabase = await createClient()
  let query = supabase.from('practice_clients').select('id, full_name, client_type, company_name, phone, email, user_id, created_at')
  query = scope === 'firm' && firmId ? query.eq('firm_id', firmId) : query.eq('owner_lawyer_id', userId)
  const s = (q ?? '').replace(/[%,()]/g, '').slice(0, 80)
  if (s) query = query.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
  const { data } = await query.order('full_name').limit(300)
  const base = scope === 'firm' ? '/firm/clients' : '/lawyer/clients'
  const firmQ = firmId ? `?firm=${firmId}` : ''
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<ClientDialog firmId={firmId} />} />
      <form action={getPathname({ href: base, locale })} className="mb-5 max-w-sm" role="search">
        {firmId ? <input type="hidden" name="firm" value={firmId} /> : null}
        <Input name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} />
      </form>
      {data?.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t('name')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('type')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('platformUser')}</th>
                <th className="px-4 py-3 text-start font-semibold" />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3">
                    <Link href={`${base}/${c.id}${firmQ}`} className="font-semibold hover:text-gold">
                      {c.full_name}
                    </Link>
                    <div className="ltr-nums text-xs text-muted-foreground">{c.phone ?? c.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3">{te(c.client_type as 'individual')}</td>
                  <td className="px-4 py-3">{c.user_id ? <BadgeCheck className="size-4 text-success" aria-label="yes" /> : '—'}</td>
                  <td className="px-4 py-3 text-end">
                    <Link href={`${base}/${c.id}${firmQ}`} className="text-xs font-semibold text-gold">
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Users} title={t('empty')} />
      )}
    </>
  )
}

export async function ClientDetailView({ id, scope, firmId }: { id: string; scope: 'lawyer' | 'firm'; firmId?: string }) {
  const t = await getTranslations('dashboard.clients')
  const tc = await getTranslations('common')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: c } = await supabase.from('practice_clients').select('*').eq('id', id).maybeSingle()
  if (!c) notFound()
  const [{ data: matters }, { data: appts }] = await Promise.all([
    supabase.from('legal_matters').select('id, reference, title, status').eq('client_record_id', id).order('updated_at', { ascending: false }),
    c.user_id
      ? supabase.from('appointments').select('id, reference, starts_at, status, consultation_type').eq('client_id', c.user_id).order('starts_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as { id: string; reference: string; starts_at: string; status: 'CONFIRMED'; consultation_type: 'video' }[] }),
  ])
  const base = scope === 'firm' ? '/firm' : '/lawyer'
  const firmQ = firmId ? `?firm=${firmId}` : ''
  return (
    <>
      <Breadcrumbs items={[{ label: t('title'), href: `${base}/clients${firmQ}` }, { label: c.full_name }]} />
      <PageHeader title={c.full_name} actions={<ClientDialog initial={c} firmId={firmId} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Section>
          <DescriptionList
            items={[
              { label: t('type'), value: te(`clientType.${c.client_type as 'individual'}`) },
              { label: t('company'), value: c.company_name ?? '—' },
              { label: tc('phone'), value: c.phone ? <span className="ltr-nums">{c.phone}</span> : '—' },
              { label: tc('email'), value: c.email ? <span className="ltr-nums">{c.email}</span> : '—' },
              { label: t('address'), value: c.address ?? '—' },
              { label: t('platformUser'), value: c.user_id ? <Badge variant="success">{tc('yes')}</Badge> : tc('no') },
            ]}
          />
          {c.notes ? <p className="mt-4 whitespace-pre-line rounded-lg bg-muted/60 p-3 text-sm">{c.notes}</p> : null}
        </Section>
        <div className="space-y-6">
          <Section title={t('matters')}>
            {matters?.length ? (
              <ul className="space-y-2">
                {matters.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`${base}/matters/${m.id}${firmQ}`} className="font-semibold hover:text-gold">
                      <span className="font-mono text-xs text-muted-foreground">{m.reference}</span> {m.title}
                    </Link>
                    <StatusBadge status={m.status} label={te(`matter.${m.status}`)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{tc('none')}</p>
            )}
          </Section>
          <Section title={t('consultations')}>
            {appts?.length ? (
              <ul className="space-y-2">
                {appts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/lawyer/appointments/${a.id}`} className="hover:text-gold">
                      {te(`consultation.${a.consultation_type}`)} · {formatDateTime(a.starts_at, locale)}
                    </Link>
                    <StatusBadge status={a.status} label={te(`appointment.${a.status}`)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{tc('none')}</p>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
