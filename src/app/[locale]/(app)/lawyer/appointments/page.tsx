import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { AppointmentList, AppointmentTabs } from '@/features/booking/components/appointment-list'
import { listAppointments, type AppointmentTab } from '@/features/booking/queries'
import { requirePortal } from '@/lib/auth'

export default async function LawyerAppointmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requirePortal('lawyer')
  const sp = await searchParams
  const tab = (['upcoming', 'pending', 'past', 'all'].includes(sp.tab ?? '') ? sp.tab : 'upcoming') as AppointmentTab
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('dashboard.appointments')
  const { rows, total, pageSize } = await listAppointments({ as: 'lawyer', tab, page })
  return (
    <>
      <PageHeader title={t('title')} description={t('lawyerSubtitle')} />
      <AppointmentTabs basePath="/lawyer/appointments" current={tab} />
      <AppointmentList rows={rows} as="lawyer" basePath="/lawyer/appointments" />
      <Pagination page={page} pageSize={pageSize ?? 20} total={total} basePath="/lawyer/appointments" searchParams={sp} />
    </>
  )
}
