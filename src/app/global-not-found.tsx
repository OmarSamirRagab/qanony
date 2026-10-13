import Link from 'next/link'
import './globals.css'

/** Fallback for requests that never reach a locale segment (e.g. malformed paths). */
export const metadata = { title: '404' }

export default function GlobalNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-dvh items-center justify-center p-6 text-center">
        <main>
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <h1 className="mt-2 text-2xl font-bold">الصفحة غير موجودة · Page not found</h1>
          <p className="mt-6">
            <Link href="/" className="text-gold underline">
              الرئيسية · Home
            </Link>
          </p>
        </main>
      </body>
    </html>
  )
}
