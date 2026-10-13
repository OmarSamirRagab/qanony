import { getLocale, getTranslations } from 'next-intl/server'
import { Container } from '@/components/shared'
import { Link } from '@/i18n/navigation'
import { getGovernorates } from '@/features/reference/queries'
import { pick } from '@/lib/utils'
import { Logo } from './logo'

export async function SiteFooter() {
  const t = await getTranslations('nav')
  const locale = await getLocale()
  const governorates = (await getGovernorates()).slice(0, 8)
  const col = (title: string, links: { href: string; label: string }[]) => (
    <div>
      <h3 className="mb-3 text-sm font-bold text-white">{title}</h3>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-white/65 transition-colors hover:text-gold">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <footer className="mt-auto bg-navy text-navy-foreground">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo onDark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">{t('footer.about')}</p>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-white/45">{t('footer.notAFirm')}</p>
        </div>
        {col(t('footer.platform'), [
          { href: '/lawyers', label: t('public.lawyers') },
          { href: '/firms', label: t('public.firms') },
          { href: '/services', label: t('public.services') },
          { href: '/articles', label: t('public.articles') },
          { href: '/faq', label: t('public.faq') },
          { href: '/about', label: t('public.about') },
          { href: '/contact', label: t('public.contact') },
        ])}
        {col(t('footer.forLawyers'), [
          { href: '/register/lawyer', label: t('footer.lawyerSignup') },
          { href: '/register/lawyer?firm=1', label: t('footer.firmSignup') },
          { href: '/pricing', label: t('footer.plans') },
        ])}
        <div className="space-y-8">
          {col(t('footer.legal'), [
            { href: '/privacy', label: t('footer.privacy') },
            { href: '/terms', label: t('footer.terms') },
            { href: '/refund-policy', label: t('footer.refund') },
          ])}
          {governorates.length
            ? col(
                t('footer.byCity'),
                governorates.map((g) => ({ href: `/cities/${g.code.toLowerCase()}`, label: pick(locale, g.name_ar, g.name_en) })),
              )
            : null}
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="py-5 text-xs text-white/50">{t('footer.rights', { year: new Date().getFullYear() })}</Container>
      </div>
    </footer>
  )
}
