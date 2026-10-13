import { Container } from '@/components/shared'
import { Skeleton } from '@/components/ui/card'

export default function Loading() {
  return (
    <Container className="py-10" aria-busy="true">
      <Skeleton className="mb-6 h-9 w-64" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Skeleton className="hidden h-96 rounded-2xl lg:block" />
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    </Container>
  )
}
