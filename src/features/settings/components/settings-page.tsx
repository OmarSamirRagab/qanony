import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { getGovernorates } from '@/features/reference/queries'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'
import { DeletionForm, NotificationPrefsForm, PrivacyForm, ProfileForm, SecurityForm } from './settings-forms'

export async function SettingsPage({ userId }: { userId: string }) {
  const t = await getTranslations('dashboard.settings')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: profile }, { data: settings }, { data: prefs }, governorates] = await Promise.all([
    supabase.from('profiles').select('full_name, phone, locale, governorate_id, status, marketing_consent').eq('id', userId).single(),
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('notification_preferences').select('event_type, channel, enabled').eq('user_id', userId),
    getGovernorates(),
  ])
  const eventLabels: Record<string, string> = Object.fromEntries(
    (['appointment.reminder', 'appointment.confirmed', 'appointment.cancelled', 'message.new', 'payment.succeeded', 'hearing.reminder', 'matter.status_changed'] as const).map((e) => [e, t(`events.${e.replace('.', '_')}` as 'events.message_new')]),
  )
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="space-y-6">
        <Section title={t('profile')}>
          <ProfileForm
            initial={{ fullName: profile?.full_name ?? '', phone: profile?.phone ?? '', locale: (profile?.locale as 'ar') ?? 'ar', governorateId: profile?.governorate_id ?? null }}
            governorates={governorates.map((g) => ({ id: g.id, name: pick(locale, g.name_ar, g.name_en) }))}
          />
        </Section>
        <Section title={t('notifications')}>
          <NotificationPrefsForm initial={prefs ?? []} eventLabels={eventLabels} />
        </Section>
        <Section title={t('privacy')}>
          <PrivacyForm
            initial={{
              showName: settings?.allow_review_display_name ?? false,
              aiEnabled: settings?.ai_enabled ?? true,
              aiConsent: Boolean(settings?.ai_document_consent_at),
              marketing: profile?.marketing_consent ?? false,
            }}
          />
        </Section>
        <Section title={t('security')}>
          <SecurityForm />
        </Section>
        <Section title={t('danger')} className="border-destructive/30">
          <DeletionForm pending={profile?.status === 'pending_deletion'} />
        </Section>
      </div>
    </>
  )
}
