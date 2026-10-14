// Pure countdown helpers (no React): which date to count down to.
import type { SiteSettings, Tournament } from './types'

export type MilestoneKind = 'opens' | 'closes' | 'starts'

export interface Milestone {
  kind: MilestoneKind
  /** ISO date the countdown goes to. */
  target: string
  label: string
}

const LABELS: Record<MilestoneKind, string> = {
  opens: 'Abren inscripciones en',
  closes: 'Cierran inscripciones en',
  starts: 'El torneo empieza en',
}

const future = (value: string | null | undefined, now: number): value is string =>
  !!value && Date.parse(value) > now

/** Next milestone of a tournament: the registration opening, its closing
 * or the start of the tournament. */
export function tournamentMilestone(tournament: Tournament, now: number, site?: SiteSettings): Milestone | null {
  if (tournament.status !== 'upcoming') return null
  const { starts_at, ends_at, is_open } = tournament.registration
  const enabled = tournament.registration_enabled && (site?.registration_enabled ?? true)
  if (enabled && future(starts_at, now)) return { kind: 'opens', target: starts_at, label: LABELS.opens }
  if (is_open && future(ends_at, now)) return { kind: 'closes', target: ends_at, label: LABELS.closes }
  if (future(tournament.start_date, now)) {
    return { kind: 'starts', target: tournament.start_date, label: LABELS.starts }
  }
  return null
}

export function countdownParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/** Short form for small places: "3d 04:12:09" or "04:12:09". */
export function countdownText(ms: number) {
  const { days, hours, minutes, seconds } = countdownParts(ms)
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${clock}` : clock
}
