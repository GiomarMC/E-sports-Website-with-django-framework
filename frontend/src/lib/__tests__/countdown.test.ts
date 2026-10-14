import { describe, expect, it } from 'vitest'
import { countdownParts, countdownText, tournamentMilestone } from '../countdown'
import type { SiteSettings, Tournament } from '../types'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const BEFORE = '2026-10-10T12:00:00Z'
const LATER = '2026-10-20T12:00:00Z'
const MUCH_LATER = '2026-11-01T12:00:00Z'

function tournament(registration: Partial<Tournament['registration']>, extra: Partial<Tournament> = {}) {
  return {
    status: 'upcoming',
    start_date: MUCH_LATER,
    registration_enabled: true,
    registration: { is_open: false, reason: '', starts_at: null, ends_at: null, registered: 0, ...registration },
    ...extra,
  } as Tournament
}

const site = (extra: Partial<SiteSettings> = {}) =>
  ({ registration_enabled: true, ...extra }) as SiteSettings

describe('tournamentMilestone', () => {
  it('counts down to the opening before the registration starts', () => {
    expect(tournamentMilestone(tournament({ starts_at: LATER }), NOW)?.kind).toBe('opens')
  })

  it('counts down to the closing while the registration is open', () => {
    const milestone = tournamentMilestone(tournament({ is_open: true, starts_at: BEFORE, ends_at: LATER }), NOW)
    expect(milestone).toMatchObject({ kind: 'closes', target: LATER })
  })

  it('counts down to the start once the registration is closed', () => {
    const milestone = tournamentMilestone(tournament({ starts_at: BEFORE, ends_at: BEFORE }), NOW)
    expect(milestone).toMatchObject({ kind: 'starts', target: MUCH_LATER })
  })

  it('skips the opening when the registration is disabled', () => {
    const closed = tournament({ starts_at: LATER })
    expect(tournamentMilestone(closed, NOW, site({ registration_enabled: false }))?.kind).toBe('starts')
  })

  it('has no countdown for ongoing tournaments', () => {
    expect(tournamentMilestone(tournament({}, { status: 'ongoing' }), NOW)).toBeNull()
  })
})

describe('countdownParts', () => {
  it('splits milliseconds into days, hours, minutes and seconds', () => {
    expect(countdownParts(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 })
    expect(countdownParts(-1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
    expect(countdownText(90_061_000)).toBe('1d 01:01:01')
    expect(countdownText(61_000)).toBe('00:01:01')
  })
})
