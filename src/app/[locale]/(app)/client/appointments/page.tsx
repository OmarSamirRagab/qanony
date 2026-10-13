import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { AppointmentList, AppointmentTabs } from '@/features/booking/components/appointment-list'
import { listAppointments, type AppointmentTab } from '@/features/booking/queries'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'

export default async function ClientAppointmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requirePortal('client')
  const sp = await searchParams
  const tab = (['upcoming', 'pending', 'past', 'all'].includes(sp.tab ?? '') ? sp.tab : 'upcoming') as AppointmentTab
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('dashboard')
  const { rows, total, pageSize } = await listAppointments({ as: 'client', tab, page })
  return (
    <>
      <PageHeader
        title={t('appointments.title')}
        description={t('appointments.clientSubtitle')}
        actions={
          <Button asChild variant="gold">
            <Link href="/lawyers">{t('client.bookNow')}</Link>
          </Button>
        }
      />
      <AppointmentTabs basePath="/client/appointments" current={tab} />
      <AppointmentList rows={rows} as="client" basePath="/client/appointments" />
      <Pagination page={page} pageSize={pageSize ?? 20} total={total} basePath="/client/appointments" searchParams={sp} />
    </>
  )
}
