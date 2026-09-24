export type DateRangeKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom'

export interface DateRangeOption {
  value: DateRangeKey
  label: string
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'all', label: 'Toutes les dates' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'this_week', label: 'Cette semaine' },
  { value: 'last_week', label: 'Semaine dernière' },
  { value: 'this_month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: 'this_year', label: 'Cette année' },
  { value: 'custom', label: 'Date personnalisée' },
]

export const DATE_RANGE_BUTTONS: { value: DateRangeKey; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'this_week', label: 'Cette semaine' },
  { value: 'last_week', label: 'Semaine dernière' },
  { value: 'this_month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: 'this_year', label: 'Cette année' },
  { value: 'custom', label: 'Personnalisée' },
]

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface DateRangeBounds {
  /** inclusive start date (YYYY-MM-DD) */
  start: string
  /** inclusive end date (YYYY-MM-DD) */
  end: string
}

/**
 * ISO (YYYY-MM-DD) start/end bounds for a period preset.
 * `custom` requires customStart/customEnd (YYYY-MM-DD).
 * Returns null when the preset does not constrain (or custom is incomplete).
 */
export function getDateRangeBounds(
  range: DateRangeKey,
  customStart?: string,
  customEnd?: string
): DateRangeBounds | null {
  const now = new Date()

  switch (range) {
    case 'today': {
      const d = toYMD(now)
      return { start: d, end: d }
    }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(now.getDate() - 1)
      const d = toYMD(y)
      return { start: d, end: d }
    }
    case 'this_week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      const mon = new Date(now)
      mon.setDate(now.getDate() - diff)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { start: toYMD(mon), end: toYMD(sun) }
    }
    case 'last_week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      const mon = new Date(now)
      mon.setDate(now.getDate() - diff - 7)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { start: toYMD(mon), end: toYMD(sun) }
    }
    case 'this_month': {
      const s = toYMD(new Date(now.getFullYear(), now.getMonth(), 1))
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      return { start: s, end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}` }
    }
    case 'last_month': {
      const ym = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const mm = now.getMonth() === 0 ? 11 : now.getMonth() - 1
      const s = toYMD(new Date(ym, mm, 1))
      const last = new Date(ym, mm + 1, 0).getDate()
      return { start: s, end: `${ym}-${String(mm + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}` }
    }
    case 'this_year': {
      return { start: `${now.getFullYear()}-01-01`, end: toYMD(now) }
    }
    case 'custom': {
      if (!customStart || !customEnd) return null
      if (customEnd < customStart) return null
      return { start: customStart, end: customEnd }
    }
    default:
      return null
  }
}

/** True when the ISO date (YYYY-MM-DD or full ISO) falls inside [start, end] bounds.
 *  When bounds is null (period non contraignante), any date matches. */
export function inDateRange(dateStr: string | undefined | null, bounds: DateRangeBounds | null): boolean {
  if (!bounds) return true
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  return d >= bounds.start && d <= bounds.end
}

/** Inclusive start/end timestamps for the period, useful with Date bounds. */
export function getDateRangePeriod(range: DateRangeKey, customStart?: string, customEnd?: string): { start: Date; end: Date } | null {
  const b = getDateRangeBounds(range, customStart, customEnd)
  if (!b) return null
  const start = new Date(`${b.start}T00:00:00`)
  const end = new Date(`${b.end}T23:59:59.999`)
  return { start, end }
}