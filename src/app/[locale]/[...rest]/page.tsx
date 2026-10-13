import { notFound } from 'next/navigation'

/** Routes unknown paths through the localized not-found page. */
export default function CatchAll() {
  notFound()
}
