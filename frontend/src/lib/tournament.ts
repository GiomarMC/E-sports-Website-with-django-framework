// Pure tournament helpers (no React): shared by pages and unit tests.
import type { BracketSection, Match, Tournament } from './types'

const ROUND_LABELS: Record<string, string> = {
  Final: 'Final',
  Semifinal: 'Semifinales',
  Quarterfinal: 'Cuartos de final',
  'Third place': 'Tercer lugar',
  'Upper Final': 'Final del upper',
  'Upper Semifinal': 'Semifinal del upper',
  'Upper Quarterfinal': 'Cuartos del upper',
  'Lower Final': 'Final del lower',
  'Grand Final': 'Gran final',
}

export function roundLabel(label: string, round: number) {
  if (!label) return `Ronda ${round}`
  if (ROUND_LABELS[label]) return ROUND_LABELS[label]
  const roundOf = /^Round of (\d+)$/.exec(label)
  if (roundOf) return `Ronda de ${roundOf[1]}`
  const side = /^(Upper|Lower) Round (\d+)$/.exec(label)
  if (side) return `Ronda ${side[2]} del ${side[1] === 'Upper' ? 'upper' : 'lower'}`
  return label
}

/** Elimination brackets have no byes: they need 2, 4, 8, 16... teams. */
export function isPowerOfTwo(value: number) {
  return value >= 2 && (value & (value - 1)) === 0
}

/** True when the admin registered a score (not only the winner). */
export function hasScore(match: Match) {
  return match.status === 'completed' && !match.is_bye && match.participants.some((p) => p.score !== 0)
}

export const BOX_W = 232
// Height of a compact match box plus room for the date / label below it.
const BOX_H = 74
export const GAP_X = 56
const GAP_Y = 36

interface Placed {
  match: Match
  x: number
  y: number
}

/** Positions matches in columns: each match is centered between the matches
 * that feed it (``next_match``), like Liquipedia brackets. */
export function layoutBracket(rounds: BracketSection['rounds']) {
  const placed = new Map<number, Placed>()
  const slot = BOX_H + GAP_Y
  rounds.forEach((round, column) => {
    let lastY = -Infinity
    const x = column * (BOX_W + GAP_X)
    for (const match of [...round.matches].sort((a, b) => a.position - b.position)) {
      const feeders = [...placed.values()].filter((p) => p.match.next_match === match.id)
      const next = lastY === -Infinity ? 0 : lastY + slot
      let y = feeders.length ? feeders.reduce((sum, p) => sum + p.y, 0) / feeders.length : next
      if (y < next) y = next
      placed.set(match.id, { match, x, y })
      lastY = y
    }
  })
  const items = [...placed.values()]
  const width = rounds.length * (BOX_W + GAP_X) - GAP_X
  const height = Math.max(0, ...items.map((p) => p.y + BOX_H)) + 24
  const lines = items.flatMap((p) => {
    const target = p.match.next_match ? placed.get(p.match.next_match) : undefined
    if (!target) return []
    const x1 = p.x + BOX_W
    const y1 = p.y + BOX_H / 2
    const x2 = target.x
    const y2 = target.y + BOX_H / 2
    const mid = x1 + (x2 - x1) / 2
    return [{ id: p.match.id, d: `M${x1} ${y1} H${mid} V${y2} H${x2}`, done: p.match.status === 'completed' && !p.match.is_bye }]
  })
  return { items, lines, width, height }
}

/** Tournament shown for a game: ongoing first, then upcoming, then the latest. */
export function currentTournament(tournaments: Tournament[], gameId: number) {
  const own = tournaments.filter((t) => t.game === gameId && t.status !== 'canceled')
  return (
    own.find((t) => t.status === 'ongoing') ??
    own.filter((t) => t.status === 'upcoming').sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ??
    own[0]
  )
}

/** Total fee: price per player times the number of members. */
export function registrationTotal(feePerPlayer: string | number, players: number) {
  return Math.round(Number(feePerPlayer) * players * 100) / 100
}

export function groupByDay(matches: Match[]) {
  const days = new Map<string, Match[]>()
  for (const match of matches) {
    const key = match.scheduled_at ? new Date(match.scheduled_at).toDateString() : 'none'
    days.set(key, [...(days.get(key) ?? []), match])
  }
  return [...days.entries()]
}
