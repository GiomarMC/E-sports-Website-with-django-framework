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
/** Height of a bracket match box (two 32px lines, divider and border). */
export const MATCH_H = 67
// Match box plus room for the date / label below it.
const BOX_H = MATCH_H + 20
export const GAP_X = 56
const GAP_Y = 22

interface Placed {
  match: Match
  x: number
  y: number
}

type Rounds = BracketSection['rounds']

/** Places the rounds in columns from ``top``: each match is centered between
 * the matches that feed it (``next_match``), like Liquipedia brackets. */
function placeRounds(rounds: Rounds, columns: number[], top: number, placed: Map<number, Placed>) {
  const slot = BOX_H + GAP_Y
  rounds.forEach((round, index) => {
    let lastY = -Infinity
    const x = columns[index] * (BOX_W + GAP_X)
    for (const match of [...round.matches].sort((a, b) => a.position - b.position)) {
      const feeders = [...placed.values()].filter((p) => p.match.next_match === match.id)
      const next = lastY === -Infinity ? top : lastY + slot
      let y = feeders.length ? feeders.reduce((sum, p) => sum + p.y, 0) / feeders.length : next
      if (y < next) y = next
      placed.set(match.id, { match, x, y })
      lastY = y
    }
  })
}

/** Lines from each match to the one its winner goes to. */
function connect(placed: Map<number, Placed>) {
  return [...placed.values()].flatMap((p) => {
    const target = p.match.next_match ? placed.get(p.match.next_match) : undefined
    if (!target) return []
    const x1 = p.x + BOX_W
    const y1 = p.y + MATCH_H / 2
    const x2 = target.x
    const y2 = target.y + MATCH_H / 2
    const mid = x1 + (x2 - x1) / 2
    return [{ id: p.match.id, d: `M${x1} ${y1} H${mid} V${y2} H${x2}`, done: p.match.status === 'completed' && !p.match.is_bye }]
  })
}

function bottom(items: Placed[]) {
  return Math.max(0, ...items.map((p) => p.y + BOX_H))
}

/** Positions the matches of a single bracket, one round per column. */
export function layoutBracket(rounds: Rounds) {
  const placed = new Map<number, Placed>()
  placeRounds(rounds, rounds.map((_, index) => index), 0, placed)
  const items = [...placed.values()]
  const width = rounds.length * (BOX_W + GAP_X) - GAP_X
  return { items, lines: connect(placed), width, height: bottom(items) + 24 }
}

/** Height of a round header (label and best of) and of a bracket title. */
export const ROUND_HEADER = 44
export const SIDE_TITLE = 30

/** A double elimination in one picture, like Liquipedia: the upper bracket
 * on top, the lower below and the grand final on the right. A round goes one
 * column after every match that feeds it, losers included, so the first
 * lower round sits under the upper round whose losers it receives. */
export function layoutDoubleBracket(sections: BracketSection[]) {
  const side = (name: string) => sections.find((section) => section.bracket === name)?.rounds ?? []
  const upper = side('upper')
  const lower = side('lower')
  const final = side('final')
  const all = [...upper, ...lower, ...final].flatMap((round) => round.matches)
  const depth = new Map<number, number>()
  const depthOf = (match: Match): number => {
    if (!depth.has(match.id)) {
      const feeders = all.filter((m) => m.next_match === match.id || m.loser_next_match === match.id)
      depth.set(match.id, Math.max(-1, ...feeders.map(depthOf)) + 1)
    }
    return depth.get(match.id)!
  }
  const columnsOf = (rounds: Rounds) => {
    const columns: number[] = []
    rounds.forEach((round, index) => {
      const column = Math.max(0, ...round.matches.map(depthOf))
      columns.push(index ? Math.max(column, columns[index - 1] + 1) : column)
    })
    return columns
  }
  const upperColumns = columnsOf(upper)
  const lowerColumns = columnsOf(lower)
  const lastColumn = Math.max(-1, ...upperColumns, ...lowerColumns)
  const finalColumns = columnsOf(final).map((column, index) => Math.max(column, lastColumn + 1 + index))

  const placed = new Map<number, Placed>()
  const upperTop = SIDE_TITLE + ROUND_HEADER
  placeRounds(upper, upperColumns, upperTop, placed)
  const lowerTitle = bottom([...placed.values()]) + 16
  const lowerTop = lowerTitle + SIDE_TITLE + ROUND_HEADER
  placeRounds(lower, lowerColumns, lowerTop, placed)
  placeRounds(final, finalColumns, upperTop, placed)

  const header = (rounds: Rounds, columns: number[], y: number) =>
    rounds.map((round, index) => ({ key: `${round.matches[0]?.bracket}-${round.round}`, x: columns[index] * (BOX_W + GAP_X), y, round }))
  const items = [...placed.values()]
  const columns = Math.max(lastColumn, ...finalColumns) + 1
  // The titles stop before the grand final, which sits between both sides.
  const titleWidth = (lastColumn + 1) * (BOX_W + GAP_X) - GAP_X
  return {
    items,
    lines: connect(placed),
    width: columns * (BOX_W + GAP_X) - GAP_X,
    height: bottom(items) + 24,
    headers: [
      ...header(upper, upperColumns, SIDE_TITLE),
      ...header(final, finalColumns, SIDE_TITLE),
      ...header(lower, lowerColumns, lowerTitle + SIDE_TITLE),
    ],
    titles: [
      ...(upper.length ? [{ side: 'upper' as const, y: 0, width: titleWidth }] : []),
      ...(lower.length ? [{ side: 'lower' as const, y: lowerTitle, width: titleWidth }] : []),
    ],
  }
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
