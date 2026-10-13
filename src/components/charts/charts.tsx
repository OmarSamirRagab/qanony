'use client'
/**
 * Chart primitives (recharts). Conventions: one value axis, thin marks, 4px
 * rounded bar ends, recessive grid, hover tooltip on every chart, text in ink
 * tokens (never series color), and a table view for accessibility.
 */
import { useLocale } from 'next-intl'
import { formatMoney } from '@/lib/domain/money'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Point {
  label: string
  value: number
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { value: number }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lift">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-bold text-foreground tabular-nums">{format(payload[0]!.value)}</div>
    </div>
  )
}

function TableView({ data, format, caption }: { data: Point[]; format: (v: number) => string; caption: string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">{caption}</summary>
      <table className="mt-2 w-full">
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-b last:border-0">
              <td className="py-1">{d.label}</td>
              <td className="py-1 text-end tabular-nums">{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

const axisTick = { fill: 'var(--color-muted-foreground)', fontSize: 11 }

export function TrendChart({ data, unit = 'count', tableCaption, height = 240 }: { data: Point[]; unit?: 'count' | 'money'; tableCaption: string; height?: number }) {
  const fmtLocale = useLocale()
  const format = (v: number) => (unit === 'money' ? formatMoney(v, fmtLocale) : new Intl.NumberFormat(fmtLocale === 'ar' ? 'ar-EG' : 'en-GB').format(v))
  const locale = useLocale()
  const rtl = locale === 'ar'
  return (
    <div>
      <div style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rtl ? [...data].reverse() : data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} orientation={rtl ? 'right' : 'left'} allowDecimals={false} tickFormatter={(v) => format(Number(v))} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: 'var(--color-muted-foreground)', strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="value" stroke="var(--series-1)" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-card)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <TableView data={data} format={format} caption={tableCaption} />
    </div>
  )
}

export function BarsChart({ data, unit = 'count', tableCaption, height = 240 }: { data: Point[]; unit?: 'count' | 'money'; tableCaption: string; height?: number }) {
  const fmtLocale = useLocale()
  const format = (v: number) => (unit === 'money' ? formatMoney(v, fmtLocale) : new Intl.NumberFormat(fmtLocale === 'ar' ? 'ar-EG' : 'en-GB').format(v))
  return (
    <div>
      <div style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => format(Number(v))} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={120} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }} />
            <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView data={data} format={format} caption={tableCaption} />
    </div>
  )
}
