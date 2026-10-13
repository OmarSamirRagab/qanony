'use client'
import type { DailyCall } from '@daily-co/daily-js'
import { Loader2, LogOut, PhoneCall, ShieldCheck, Timer, Wifi, WifiOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'joining' | 'joined' | 'left' | 'error'

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Embeds Daily Prebuilt (device test, camera/mic controls) with our own status bar and timer. */
export function VideoRoom({ appointmentId, endsAt }: { appointmentId: string; endsAt: string }) {
  const t = useTranslations('dashboard.consultation')
  const te = useTranslations('errors')
  const container = useRef<HTMLDivElement>(null)
  const frame = useRef<DailyCall | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [network, setNetwork] = useState<'good' | 'poor'>('good')
  const [others, setOthers] = useState(0)
  const [joinedAt, setJoinedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => new Date().getTime())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => void frame.current?.destroy(), [])

  async function join() {
    setPhase('joining')
    const res = await fetch(`/api/meetings/${appointmentId}/join`, { method: 'POST' })
    const body = (await res.json()) as { ok: boolean; url?: string; token?: string; error?: string }
    if (!res.ok || !body.url || !body.token) {
      setPhase('error')
      toast.error(te((body.error ?? 'unknown') as 'unknown'))
      return
    }
    const { default: Daily } = await import('@daily-co/daily-js')
    frame.current?.destroy()
    const call = Daily.createFrame(container.current!, {
      iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '12px' },
      showLeaveButton: true,
      showFullscreenButton: true,
    })
    frame.current = call
    call
      .on('joined-meeting', () => {
        setPhase('joined')
        setJoinedAt(Date.now())
      })
      .on('left-meeting', () => setPhase('left'))
      .on('participant-joined', () => setOthers(Object.keys(call.participants()).length - 1))
      .on('participant-left', () => setOthers(Object.keys(call.participants()).length - 1))
      .on('network-quality-change', (e) => setNetwork(e?.threshold === 'good' ? 'good' : 'poor'))
      .on('error', () => setPhase('error'))
    await call.join({ url: body.url, token: body.token })
    setOthers(Object.keys(call.participants()).length - 1)
  }

  const remaining = new Date(endsAt).getTime() - now
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-2 text-sm">
        <span className={cn('flex items-center gap-1.5 font-semibold', phase === 'joined' ? 'text-success' : 'text-muted-foreground')}>
          {phase === 'joined' ? network === 'good' ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4 text-warning" aria-hidden /> : null}
          {phase === 'joined' ? (network === 'good' ? t('connected') : t('reconnecting')) : phase === 'joining' ? t('joining') : phase === 'left' ? t('left') : ''}
        </span>
        {phase === 'joined' && others === 0 ? <span className="text-muted-foreground">{t('waiting')}</span> : null}
        <span className="ms-auto flex items-center gap-1.5 tabular-nums" aria-live="off">
          <Timer className="size-4 text-gold" aria-hidden />
          {joinedAt ? `${t('elapsed')} ${mmss(now - joinedAt)} · ` : ''}
          {t('remaining')} {mmss(remaining)}
        </span>
        {phase === 'joined' ? (
          <Button size="sm" variant="destructive" onClick={() => void frame.current?.leave()}>
            <LogOut aria-hidden /> {t('leave')}
          </Button>
        ) : null}
      </div>
      <div ref={container} className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border bg-navy">
        {phase === 'idle' || phase === 'left' || phase === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-navy-foreground">
            <PhoneCall className="size-10 text-gold" aria-hidden />
            <p className="max-w-sm text-sm text-white/70">{t('deviceHint')}</p>
            <Button variant="gold" size="lg" onClick={() => void join()}>
              {phase === 'left' ? t('rejoin') : t('join')}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-white/50">
              <ShieldCheck className="size-3.5" aria-hidden /> {t('privacy')}
            </p>
          </div>
        ) : null}
        {phase === 'joining' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-gold" aria-label={t('joining')} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
