'use client'
import { CalendarClock, CalendarPlus, CheckCircle2, FolderPlus, Gavel, MessagesSquare, Play, Star, UserX, Video, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay'
import { Link, useRouter } from '@/i18n/navigation'
import { formatMoney, toMinor } from '@/lib/domain/money'
import { appointmentRefundPercent } from '@/lib/domain/refunds'
import { availableAppointmentActions, canJoinMeeting, type AppointmentStatus } from '@/lib/domain/status'
import { cn } from '@/lib/utils'
import type { Enums } from '@/types/database'
import { createFollowUp, rescheduleAppointment, transitionAppointment } from '../actions'
import { createMatterFromAppointment } from '@/features/matters/actions'
import { DisputeDialog } from '@/features/disputes/components/dispute-dialog'
import { ReviewDialog } from '@/features/reviews/components/review-dialog'
import { SlotPicker } from './slot-picker'

export interface AppointmentActionsProps {
  viewer: 'client' | 'lawyer'
  appointment: {
    id: string
    status: AppointmentStatus
    startsAt: string
    endsAt: string
    occupiesSlot: boolean
    consultationType: Enums<'consultation_kind'>
    lawyerId: string
    timezone: string
    deadlineHours: number
    matterId: string | null
    reference: string
    holdExpiresAt: string | null
    completedAt: string | null
  }
  paidMinor: number
  latePercent: number
  conversationId: string | null
  hasReview: boolean
  hasOpenDispute: boolean
  offerings: { consultation_type: Enums<'consultation_kind'>; price_minor: number }[]
  today: string
}

const MEETING_TYPES = new Set(['video', 'voice'])

export function AppointmentActions(props: AppointmentActionsProps) {
  const t = useTranslations('dashboard.appointments')
  const te = useTranslations('enums')
  const terr = useTranslations('errors')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [dialog, setDialog] = useState<null | 'cancel' | 'reschedule' | 'followup' | 'matter' | 'review' | 'dispute' | 'confirm-action'>(null)
  const [actionTo, setActionTo] = useState<AppointmentStatus | null>(null)
  const [reason, setReason] = useState('')
  const [slot, setSlot] = useState<string | null>(null)
  const [followType, setFollowType] = useState<Enums<'consultation_kind'>>(props.appointment.consultationType === 'written_opinion' ? 'video' : props.appointment.consultationType)
  const [followPrice, setFollowPrice] = useState('0')
  const [matterTitle, setMatterTitle] = useState('')

  const a = props.appointment
  const now = new Date()
  const actions = availableAppointmentActions(props.viewer, { status: a.status, startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt), occupiesSlot: a.occupiesSlot, now })
  const joinable = MEETING_TYPES.has(a.consultationType) && canJoinMeeting(a.status, new Date(a.startsAt), new Date(a.endsAt), now)
  const refundPercent = appointmentRefundPercent({
    actor: props.viewer === 'client' ? 'client' : 'lawyer',
    status: a.status,
    startsAt: new Date(a.startsAt),
    occupiesSlot: a.occupiesSlot,
    cancellationDeadlineHours: a.deadlineHours,
    lateCancelRefundPercent: props.latePercent,
  })
  const canReschedule = a.occupiesSlot && ['PENDING_CONFIRMATION', 'CONFIRMED'].includes(a.status) && (props.viewer === 'lawyer' || new Date(a.startsAt).getTime() - now.getTime() >= a.deadlineHours * 3_600_000)
  const disputeWindow = !a.completedAt || now.getTime() - new Date(a.completedAt).getTime() < 14 * 86_400_000
  const canDispute = !props.hasOpenDispute && ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(a.status) && disputeWindow && (a.status !== 'CONFIRMED' || new Date(a.startsAt) < now)

  const run = (fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>, success: string) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.detail ?? terr((res.error ?? 'unknown') as 'unknown'))
        return
      }
      toast.success(success)
      setDialog(null)
      router.refresh()
    })

  const transitionButtons = actions.filter((s) => s !== 'CANCELLED')
  const ICONS: Partial<Record<AppointmentStatus, typeof Play>> = { CONFIRMED: CheckCircle2, IN_PROGRESS: Play, COMPLETED: CheckCircle2, NO_SHOW: UserX }

  return (
    <div className="flex flex-col gap-2">
      {props.viewer === 'client' && a.status === 'PENDING_PAYMENT' && a.holdExpiresAt && new Date(a.holdExpiresAt) > now ? (
        <Button asChild variant="gold" size="lg">
          <Link href={`/checkout/appointment/${a.id}`}>{t('pay')}</Link>
        </Button>
      ) : null}
      {joinable ? (
        <Button asChild variant="gold" size="lg">
          <Link href={`/consultation/${a.id}`}>
            <Video aria-hidden /> {t('join')}
          </Link>
        </Button>
      ) : MEETING_TYPES.has(a.consultationType) && a.status === 'CONFIRMED' ? (
        <p className="rounded-lg bg-muted p-2.5 text-center text-xs text-muted-foreground">{t('joinOpensAt')}</p>
      ) : null}
      {props.conversationId ? (
        <Button asChild variant="outline">
          <Link href={`/${props.viewer}/messages/${props.conversationId}`}>
            <MessagesSquare aria-hidden /> {t('openChat')}
          </Link>
        </Button>
      ) : null}

      {props.viewer === 'lawyer'
        ? transitionButtons.map((to) => {
            const Icon = ICONS[to] ?? CheckCircle2
            return (
              <Button
                key={to}
                variant={to === 'NO_SHOW' ? 'outline' : 'default'}
                loading={pending && actionTo === to}
                onClick={() => {
                  setActionTo(to)
                  if (to === 'NO_SHOW' || to === 'COMPLETED') setDialog('confirm-action')
                  else run(() => transitionAppointment({ id: a.id, to: to as 'CONFIRMED' }), t('updated'))
                }}
              >
                <Icon aria-hidden /> {te(`appointmentAction.${to as 'CONFIRMED'}`)}
              </Button>
            )
          })
        : null}

      {canReschedule ? (
        <Button variant="outline" onClick={() => setDialog('reschedule')}>
          <CalendarClock aria-hidden /> {t('reschedule')}
        </Button>
      ) : null}
      {props.viewer === 'lawyer' && ['COMPLETED', 'IN_PROGRESS', 'CONFIRMED'].includes(a.status) ? (
        <Button variant="outline" onClick={() => setDialog('followup')}>
          <CalendarPlus aria-hidden /> {t('followUp')}
        </Button>
      ) : null}
      {props.viewer === 'lawyer' && !a.matterId ? (
        <Button variant="outline" onClick={() => setDialog('matter')}>
          <FolderPlus aria-hidden /> {t('createMatter')}
        </Button>
      ) : null}
      {a.matterId ? (
        <Button asChild variant="outline">
          <Link href={`/${props.viewer}/matters/${a.matterId}`}>{t('viewMatter')}</Link>
        </Button>
      ) : null}
      {props.viewer === 'client' && a.status === 'COMPLETED' && !props.hasReview ? (
        <Button variant="gold" onClick={() => setDialog('review')} id="review">
          <Star aria-hidden /> {t('review')}
        </Button>
      ) : null}
      {actions.includes('CANCELLED') ? (
        <Button variant="ghost" className="text-destructive hover:bg-danger-soft hover:text-destructive" onClick={() => setDialog('cancel')}>
          <XCircle aria-hidden /> {t('cancel')}
        </Button>
      ) : null}
      {canDispute ? (
        <Button variant="ghost" className="text-muted-foreground" onClick={() => setDialog('dispute')}>
          <Gavel aria-hidden /> {t('dispute')}
        </Button>
      ) : null}

      {/* Cancel */}
      <Dialog open={dialog === 'cancel'} onOpenChange={(o) => setDialog(o ? 'cancel' : null)}>
        <DialogContent title={t('cancelTitle')} closeLabel={tc('close')}>
          {props.paidMinor > 0 ? (
            <p className={cn('mb-4 rounded-lg p-3 text-sm', refundPercent > 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
              {refundPercent > 0 ? t('refundPreview', { percent: refundPercent }) : t('noRefund')}
              {refundPercent > 0 ? ` (${formatMoney(Math.floor((props.paidMinor * refundPercent) / 100), locale)})` : ''}
            </p>
          ) : null}
          <FormField id="reason" label={t('cancelReason')} hint={props.viewer === 'lawyer' ? t('cancelReasonRequired') : undefined}>
            <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </FormField>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {tc('back')}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={props.viewer === 'lawyer' && reason.trim().length < 3}
              onClick={() => run(() => transitionAppointment({ id: a.id, to: 'CANCELLED', reason }), t('cancelled'))}
            >
              {t('confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm completion / no-show */}
      <Dialog open={dialog === 'confirm-action'} onOpenChange={(o) => setDialog(o ? 'confirm-action' : null)}>
        <DialogContent title={t('confirmAction')} description={actionTo ? te(`appointmentAction.${actionTo as 'COMPLETED'}`) : undefined} closeLabel={tc('close')}>
          {actionTo === 'NO_SHOW' ? (
            <FormField id="ns-reason" label={tc('notes')}>
              <Textarea id="ns-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {tc('back')}
            </Button>
            <Button loading={pending} onClick={() => run(() => transitionAppointment({ id: a.id, to: actionTo as 'COMPLETED', reason }), t('updated'))}>
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule */}
      <Dialog open={dialog === 'reschedule'} onOpenChange={(o) => setDialog(o ? 'reschedule' : null)}>
        <DialogContent title={t('rescheduleTitle')} description={props.viewer === 'client' ? t('rescheduleNote', { hours: a.deadlineHours }) : undefined} closeLabel={tc('close')} className="max-w-2xl">
          <SlotPicker lawyerId={a.lawyerId} type={a.consultationType} timezone={a.timezone} today={props.today} value={slot} onChange={setSlot} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {tc('back')}
            </Button>
            <Button loading={pending} disabled={!slot} onClick={() => slot && run(() => rescheduleAppointment({ id: a.id, startsAt: slot }), t('rescheduled'))}>
              {t('confirmReschedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up (lawyer) */}
      <Dialog open={dialog === 'followup'} onOpenChange={(o) => setDialog(o ? 'followup' : null)}>
        <DialogContent title={t('followUpTitle')} closeLabel={tc('close')} className="max-w-2xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="fu-type" label={t('type')}>
              <NativeSelect id="fu-type" value={followType} onChange={(e) => setFollowType(e.target.value as Enums<'consultation_kind'>)}>
                {props.offerings
                  .filter((o) => o.consultation_type !== 'written_opinion')
                  .map((o) => (
                    <option key={o.consultation_type} value={o.consultation_type}>
                      {te(`consultation.${o.consultation_type}`)}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
            <FormField id="fu-price" label={t('followUpPrice')} hint={t('followUpPriceHint')}>
              <Input id="fu-price" type="number" min={0} inputMode="decimal" value={followPrice} onChange={(e) => setFollowPrice(e.target.value)} />
            </FormField>
          </div>
          <div className="mt-4">
            <SlotPicker lawyerId={a.lawyerId} type={followType} timezone={a.timezone} today={props.today} value={slot} onChange={setSlot} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {tc('back')}
            </Button>
            <Button
              loading={pending}
              disabled={!slot}
              onClick={() =>
                slot &&
                run(
                  () => createFollowUp({ originalId: a.id, type: followType as 'video', startsAt: slot, priceMinor: toMinor(Number(followPrice) || 0) }),
                  t('followUpCreated'),
                )
              }
            >
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create matter (lawyer) */}
      <Dialog open={dialog === 'matter'} onOpenChange={(o) => setDialog(o ? 'matter' : null)}>
        <DialogContent title={t('createMatter')} closeLabel={tc('close')}>
          <FormField id="matter-title" label={t('matterTitle')}>
            <Input id="matter-title" value={matterTitle} onChange={(e) => setMatterTitle(e.target.value)} placeholder={a.reference} />
          </FormField>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {tc('back')}
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await createMatterFromAppointment(a.id, matterTitle)
                  if (!res.ok) return void toast.error(terr(res.error))
                  toast.success(t('matterCreated'))
                  router.push(`/lawyer/matters/${res.data.id}`)
                })
              }
            >
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {props.viewer === 'client' ? <ReviewDialog open={dialog === 'review'} onOpenChange={(o) => setDialog(o ? 'review' : null)} appointmentId={a.id} /> : null}
      <DisputeDialog open={dialog === 'dispute'} onOpenChange={(o) => setDialog(o ? 'dispute' : null)} appointmentId={a.id} />
    </div>
  )
}
