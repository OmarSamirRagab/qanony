import { expect, test } from '@playwright/test'
import { msg } from './messages'

/**
 * Public-surface checks that do not need a database: localisation & direction,
 * routing guards, error pages, SEO files, security headers and client-side
 * form validation.
 */

test('Arabic is the default locale and renders right-to-left', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('English is served under /en and renders left-to-right', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})

test('language switcher keeps the current page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'switcher is in the mobile menu on small screens')
  await page.goto('/faq')
  await page.getByRole('button', { name: msg('ar', 'common.switchLanguage') }).click()
  await expect(page).toHaveURL(/\/en\/faq$/)
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})

test('mobile menu opens and lists primary navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only')
  await page.goto('/en')
  await page.getByRole('button', { name: msg('en', 'common.openMenu') }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

for (const path of ['/client', '/lawyer/appointments', '/admin', '/firm/matters', '/en/client/documents']) {
  test(`signed-out visitors are sent to login from ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login\?next=/)
  })
}

test('unknown pages return a localised 404', async ({ page }) => {
  const res = await page.goto('/en/this-page-does-not-exist')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: msg('en', 'common.notFoundTitle') })).toBeVisible()
})

test('security headers are set on HTML responses', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBeTruthy()
})

test('robots.txt blocks private areas and links the sitemap', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text()
  expect(body).toMatch(/Disallow: \/admin/)
  expect(body).toMatch(/Disallow: \/en\/client/)
  expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/)
})

test('sitemap lists public pages with language alternates', async ({ request }) => {
  const body = await (await request.get('/sitemap.xml')).text()
  expect(body).toContain('<urlset')
  expect(body).toContain('/lawyers')
  expect(body).toContain('hreflang="en"')
  expect(body).not.toContain('/admin')
})

test('login form validates input before contacting the server', async ({ page }) => {
  await page.goto('/en/login')
  await page.getByRole('button', { name: msg('en', 'auth.login.submit'), exact: true }).click()
  await expect(page.getByText(msg('en', 'errors.invalidEmail'))).toBeVisible()
  await expect(page).toHaveURL(/\/en\/login/)
})

test('legal pages are reachable from the footer', async ({ page }) => {
  await page.goto('/en')
  const footer = page.locator('footer')
  await footer.getByRole('link', { name: /privacy/i }).first().click()
  await expect(page).toHaveURL(/\/en\/privacy/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('cron endpoint rejects unauthenticated calls', async ({ request }) => {
  const res = await request.get('/api/cron/reminders')
  expect([401, 503]).toContain(res.status())
})

test('payment webhook rejects unknown providers', async ({ request }) => {
  const res = await request.post('/api/payments/not-a-provider/webhook', { data: {} })
  expect(res.status()).toBeGreaterThanOrEqual(400)
})
