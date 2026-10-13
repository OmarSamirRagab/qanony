'use client'

/** Last-resort boundary for errors thrown in the root layout itself. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <main>
          <h1 style={{ fontSize: 22 }}>حدث خطأ غير متوقع · Something went wrong</h1>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}>
            إعادة المحاولة · Try again
          </button>
        </main>
      </body>
    </html>
  )
}
