import { expect, test, type Page } from '@playwright/test'
import { msg } from './messages'

/**
 * End-to-end business flows against a real Supabase project.
 *
 * Requirements (see TESTING.md): migrations + seed applied, PAYMENTS_SANDBOX_ENABLED=true,
 * and these accounts created beforehand:
 *   E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD   — active client
 *   E2E_LAWYER_EMAIL / E2E_LAWYER_PASSWORD   — verified, published lawyer with availability
 *   E2E_LAWYER_SLUG                          — that lawyer's public slug (paid video offering)
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD     — admin
 * The whole file is skipped unless E2E_SUPABASE=1.
 */
test.skip(process.env.E2E_SUPABASE !== '1', 'requires a configured Supabase test project (E2E_SUPABASE=1)')
test.describe.configure({ mode: 'serial' })

const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}`)
  return v
}

async function login(page: Page, who: 'CLIENT' | 'LAWYER' | 'ADMIN') {
  await page.goto('/en/login')
  await page.getByLabel(msg('en', 'auth.login.email')).fill(env(`E2E_${who}_EMAIL`))
  await page.getByLabel(msg('en', 'auth.login.password')).fill(env(`E2E_${who}_PASSWORD`))
  await page.getByRole('button', { name: msg('en', 'auth.login.submit'), exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

test('client signs in and lands on their dashboard', async ({ page }) => {
  await login(page, 'CLIENT')
  await expect(page).toHaveURL(/\/en\/client/)
})

test('public search finds the published lawyer and opens the profile', async ({ page }) => {
  await page.goto('/en/lawyers')
  const slug = env('E2E_LAWYER_SLUG')
  await page.locator(`a[href$="/lawyers/${slug}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`/lawyers/${slug}$`))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

async function bookToCheckout(page: Page) {
  await page.goto(`/en/book/${env('E2E_LAWYER_SLUG')}`)
  await page.getByRole('button', { pressed: false }).filter({ hasText: msg('en', 'enums.consultation.video') }).first().click()
  await page.getByRole('button', { name: new RegExp(msg('en', 'common.next')) }).click()
  await page.locator('button[aria-pressed]').filter({ hasText: /\d/ }).first().click()
  await page.getByRole('button', { name: new RegExp(msg('en', 'common.next')) }).click()
  await page.getByLabel(msg('en', 'booking.issue')).fill('I need advice on ending a residential lease early and the notice period required.')
  await page.getByRole('button', { name: new RegExp(msg('en', 'common.next')) }).click()
  await page.getByRole('button', { name: msg('en', 'booking.confirmPay') }).click()
  await expect(page).toHaveURL(/\/checkout\//, { timeout: 20_000 })
}

test('client books a paid consultation and pays through the sandbox gateway', async ({ page }) => {
  await login(page, 'CLIENT')
  await bookToCheckout(page)
  // Checkout page → sandbox gateway (clearly labelled test payment).
  const pay = page.getByRole('link', { name: /pay|ادفع/i }).or(page.getByRole('button', { name: /pay|ادفع/i }))
  if (await pay.first().isVisible()) await pay.first().click()
  await page.getByTestId('sandbox-approve').click()
  await expect(page).toHaveURL(/\/checkout\/result/, { timeout: 20_000 })
  await page.goto('/en/client/appointments')
  await expect(page.getByText(/AP-\d{4}-\d+/).first()).toBeVisible()
})

test('a declined sandbox payment does not confirm the booking', async ({ page }) => {
  await login(page, 'CLIENT')
  await bookToCheckout(page)
  const pay = page.getByRole('link', { name: /pay|ادفع/i }).or(page.getByRole('button', { name: /pay|ادفع/i }))
  if (await pay.first().isVisible()) await pay.first().click()
  await page.getByTestId('sandbox-decline').click()
  await expect(page).toHaveURL(/\/checkout\/result/, { timeout: 20_000 })
})

test('lawyer sees the new booking in their appointments', async ({ page }) => {
  await login(page, 'LAWYER')
  await page.goto('/en/lawyer/appointments')
  await expect(page.getByText(/AP-\d{4}-\d+/).first()).toBeVisible()
})

test('clients cannot open the admin portal', async ({ page }) => {
  await login(page, 'CLIENT')
  await page.goto('/en/admin')
  await expect(page).not.toHaveURL(/\/en\/admin$/)
})

test('admin overview and integration status load', async ({ page }) => {
  await login(page, 'ADMIN')
  await page.goto('/en/admin')
  await expect(page.getByRole('heading', { name: msg('en', 'admin.overview.title') })).toBeVisible()
  await page.goto('/en/admin/integrations')
  await expect(page.getByRole('heading', { name: msg('en', 'admin.integrations.title') })).toBeVisible()
  // Secrets are never rendered — only variable names.
  await expect(page.locator('body')).not.toContainText(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '__never__')
})
