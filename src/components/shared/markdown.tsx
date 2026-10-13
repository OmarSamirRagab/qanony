import { Fragment } from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal, safe Markdown renderer (no HTML injection): headings (##, ###),
 * paragraphs, unordered/ordered lists, blockquotes and **bold** inline.
 * Used for CMS content, articles, legal pages and AI output.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: React.ReactNode[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++}>{inline(line.slice(4))}</h3>)
      i++
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++}>{inline(line.slice(3))}</h2>)
      i++
    } else if (line.startsWith('# ')) {
      blocks.push(<h2 key={key++}>{inline(line.slice(2))}</h2>)
      i++
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*] /.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*] /, ''))
      blocks.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      )
    } else if (/^\s*\d+[.)] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)] /.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)] /, ''))
      blocks.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ol>,
      )
    } else if (line.startsWith('> ')) {
      const quote: string[] = []
      while (i < lines.length && lines[i]!.startsWith('> ')) quote.push(lines[i++]!.slice(2))
      blocks.push(<blockquote key={key++}>{inline(quote.join(' '))}</blockquote>)
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i]!.trim() && !/^(#{1,3} |\s*[-*] |\s*\d+[.)] |> )/.test(lines[i]!)) para.push(lines[i++]!)
      blocks.push(<p key={key++}>{inline(para.join(' '))}</p>)
    }
  }
  return <div className={cn('prose-legal', className)}>{blocks}</div>
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}
