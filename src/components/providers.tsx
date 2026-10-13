'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Direction } from 'radix-ui'
import { useState } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/primitives'

export function Providers({ children, dir }: { children: React.ReactNode; dir: 'rtl' | 'ltr' }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }),
  )
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Direction.Provider dir={dir}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {children}
            <Toaster position={dir === 'rtl' ? 'top-left' : 'top-right'} dir={dir} richColors closeButton toastOptions={{ className: 'font-sans' }} />
          </TooltipProvider>
        </QueryClientProvider>
      </Direction.Provider>
    </ThemeProvider>
  )
}
