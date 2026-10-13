import { ShoppingBag } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Breadcrumbs } from '@/components/shared/server'
import { DocumentList } from '@/features/documents/components/document-list'
import { DocumentUploader } from '@/features/documents/components/document-uploader'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { formatDate, formatDateTime } from '@/lib/format'
import { pick } from '@/lib/utils'
import { getOrder, listOrders } from '../queries'
import { OrderActions } from './order-actions'

export async function OrdersListView({ as, userId, page }: { as: 'client' | 'lawyer'; userId: string; page: number }) {
  const t = await getTranslations('dashboard.orders')
  const te = await getTranslations('enums.serviceOrder')
  const locale = await getLocale()
  const { rows } = await listOrders(as, userId, page)
  const base = `/${as}/orders`
  return (
    <>
      <PageHeader title={t('title')} description={as === 'client' ? t('clientSubtitle') : t('lawyerSubtitle')} />
      {rows.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`${base}/${o.id}`} className="flex flex-col gap-2 p-4 hover:bg-muted/50 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{o.service ? pick(locale, o.service.title_ar, o.service.title_en) : o.reference}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{o.reference}</span> · {as === 'client' ? (o.lawyer ? pick(locale, o.lawyer.display_name_ar, o.lawyer.display_name_en) : '') : o.client?.full_name}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {o.due_at ? <span className="text-xs text-muted-foreground">{t('due')}: {formatDate(o.due_at, locale)}</span> : null}
                  <span className="font-semibold">{formatMoney(o.price_minor, locale)}</span>
                  <StatusBadge status={o.status} label={te(o.status)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={ShoppingBag} title={t('empty')} action={as === 'client' ? <Link href="/services" className="font-semibold text-gold">{t('browse')}</Link> : undefined} />
      )}
    </>
  )
}

export async function OrderDetailView({ id, viewer, userId }: { id: string; viewer: 'client' | 'lawyer'; userId: string }) {
  const data = await getOrder(id)
  if (!data) notFound()
  const { order, documents, conversationId, review, dispute } = data
  const t = await getTranslations('dashboard.orders')
  const te = await getTranslations('enums')
  const tn = await getTranslations('nav')
  const ts = await getTranslations('content.services')
  const tr = await getTranslations('enums.role')
  const locale = await getLocale()
  const title = order.service ? pick(locale, order.service.title_ar, order.service.title_en) : order.reference
  const deliverables = documents.filter((d) => d.category === 'deliverable')
  const others = documents.filter((d) => d.category !== 'deliverable')
  const canUpload = !['CANCELLED', 'REFUNDED', 'COMPLETED', 'CREATED', 'PENDING_PAYMENT'].includes(order.status)
  return (
    <>
      <Breadcrumbs items={[{ label: tn(`${viewer}.orders`), href: `/${viewer}/orders` }, { label: order.reference }]} />
      <PageHeader title={title} description={<span className="font-mono">{order.reference}</span>} actions={<StatusBadge status={order.status} label={te(`serviceOrder.${order.status}`)} className="text-sm" />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Section>
            <DescriptionList
              items={[
                { label: viewer === 'client' ? ts('provider') : tr('client'), value: viewer === 'client' ? (order.lawyer ? pick(locale, order.lawyer.display_name_ar, order.lawyer.display_name_en) : '—') : order.client?.full_name },
                { label: ts('price'), value: formatMoney(order.price_minor, locale) },
                { label: t('due'), value: order.due_at ? formatDateTime(order.due_at, locale) : '—' },
                { label: ts('packages'), value: order.package ? pick(locale, order.package.name_ar, order.package.name_en) : ts('basePackage') },
                { label: ts('revisions'), value: t('revisions', { used: order.revisions_used, allowed: order.revisions_allowed }) },
              ]}
            />
            {order.requirements ? (
              <div className="mt-5 rounded-xl bg-muted/60 p-4">
                <div className="mb-1 text-xs font-bold text-muted-foreground">{t('requirements')}</div>
                <p className="whitespace-pre-line text-sm">{order.requirements}</p>
              </div>
            ) : null}
            {order.service?.required_documents?.length ? (
              <div className="mt-4 text-sm">
                <div className="mb-1 font-semibold">{ts('requiredDocuments')}</div>
                <ul className="list-disc ps-5 text-muted-foreground">
                  {order.service.required_documents.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
          <Section title={t('deliverables')} action={viewer === 'lawyer' && canUpload ? <DocumentUploader target={{ serviceOrderId: id }} defaultCategory="deliverable" label={t('uploadDeliverable')} variant="gold" /> : null}>
            <DocumentList documents={deliverables} currentUserId={userId} />
          </Section>
          <Section title={tn('client.documents')} action={canUpload ? <DocumentUploader target={{ serviceOrderId: id }} /> : null}>
            <DocumentList documents={others} currentUserId={userId} />
          </Section>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <OrderActions
              id={id}
              viewer={viewer}
              status={order.status}
              revisionsUsed={order.revisions_used}
              revisionsAllowed={order.revisions_allowed}
              conversationId={conversationId}
              hasReview={Boolean(review)}
              hasOpenDispute={Boolean(dispute && !['resolved', 'rejected', 'closed'].includes(dispute.status))}
            />
            {dispute ? (
              <Link href={`/disputes/${dispute.id}`} className="mt-3 block text-center text-sm font-semibold text-gold">
                {dispute.reference}
              </Link>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  )
}
