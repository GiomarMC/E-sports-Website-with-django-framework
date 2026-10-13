import { ArrowRight, ArrowSquareOut, Broadcast, Clock, Crown, Trophy } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { formatDate, formatTime, matchStatusLabel, platformLabel } from '../lib/format'
import { toEmbed } from '../lib/streams'
import { BOX_W, GAP_X, hasScore, layoutBracket, roundLabel } from '../lib/tournament'
import type { BracketSection, GroupStandings, Match, MatchParticipant, Stream } from '../lib/types'
import { Badge, cx, TeamLogo } from './ui'

// ------------------------------------------------------------ match row

function ParticipantLine({
  participant,
  match,
  compact,
}: {
  participant: MatchParticipant | undefined
  match: Match
  compact?: boolean
}) {
  // A bye is not a played match: the team simply passes to the next round,
  // so it is not shown as a winner.
  const bye = match.is_bye
  const name = participant?.registration_name ?? (bye ? 'Pase directo' : 'Por definir')
  const decided = !bye && match.status === 'completed' && match.winner !== null
  const isWinner = decided && participant?.registration === match.winner
  const isLoser = decided && !isWinner
  return (
    <div
      className={cx(
        'flex items-center gap-2.5 px-3 transition-colors',
        compact ? 'h-9' : 'h-11',
        isWinner && 'bg-win-soft',
      )}
    >
      {participant?.registration ? (
        <TeamLogo src={participant.logo} name={name} size={compact ? 20 : 24} />
      ) : bye ? (
        <ArrowRight size={compact ? 14 : 16} className="mx-[3px] shrink-0 text-ink-400" />
      ) : (
        <span className={cx('shrink-0 rounded-md border border-dashed border-white/10', compact ? 'size-5' : 'size-6')} />
      )}
      <span
        className={cx(
          'min-w-0 flex-1 truncate text-sm',
          isWinner ? 'font-semibold text-ink-100' : isLoser ? 'text-ink-400' : 'text-ink-300',
          !participant?.registration && (bye ? 'text-xs uppercase tracking-wide text-ink-400' : 'italic text-ink-600'),
        )}
      >
        {name}
      </span>
      {isWinner && <Crown size={14} weight="fill" className="shrink-0 text-win" />}
      <span
        className={cx(
          'w-6 text-right font-mono text-sm tabular-nums',
          isWinner ? 'font-semibold text-win' : 'text-ink-400',
        )}
      >
        {hasScore(match) ? participant?.score : ''}
      </span>
    </div>
  )
}

type OnMatch = (match: Match) => void

export function MatchBox({
  match,
  compact,
  className,
  onClick,
}: {
  match: Match
  compact?: boolean
  className?: string
  /** Admin: makes the match clickable (e.g. to define the winner). */
  onClick?: OnMatch
}) {
  const [a, b] = [...match.participants].sort((x, y) =>
    // In a bye the team goes first and the empty slot ("pase directo") last.
    match.is_bye ? Number(!x.registration) - Number(!y.registration) : x.slot - y.slot,
  )
  const clickable = !!onClick && !match.is_bye
  const Tag = clickable ? 'button' : 'div'
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={clickable ? () => onClick(match) : undefined}
      title={clickable ? 'Definir o corregir el resultado' : undefined}
      className={cx(
        'block w-full overflow-hidden rounded-xl border bg-ink-850 text-left divide-y divide-white/[0.05]',
        match.status === 'live' ? 'border-live/50' : match.is_bye ? 'border-dashed border-white/10' : 'border-white/[0.07]',
        clickable && 'transition hover:border-accent/60 hover:bg-ink-800',
        className,
      )}
    >
      <ParticipantLine participant={a} match={match} compact={compact} />
      <ParticipantLine participant={b} match={match} compact={compact} />
    </Tag>
  )
}

/** Wide match card for schedules: time, stage, teams, score and stream. */
export function MatchCard({ match, gameName }: { match: Match; gameName?: string }) {
  const stream = match.streams.find((s) => s.is_live) ?? match.streams[0]
  const ffa = match.participants.length > 2
  return (
    <div
      className={cx(
        'surface grid gap-4 p-4 sm:grid-cols-[96px_1fr_auto] sm:items-center',
        match.status === 'live' && 'border-live/40',
      )}
    >
      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1">
        <span className="font-mono text-lg font-semibold tabular-nums text-ink-100">{formatTime(match.scheduled_at)}</span>
        <span className="text-xs text-ink-400">{match.scheduled_at ? formatDate(match.scheduled_at) : 'Sin fecha'}</span>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-400">
          {gameName && <span className="font-semibold text-ink-300">{gameName}</span>}
          <span>{match.stage_name}</span>
          {match.group_name && <span>· {match.group_name}</span>}
          <span>· {match.group_name || match.participants.length > 2 ? `Fecha ${match.round}` : roundLabel(match.label, match.round)}</span>
          <span>· Bo{match.best_of}</span>
        </div>
        {ffa ? (
          <p className="text-sm text-ink-300">
            {match.participants.length} participantes
            {match.status === 'completed' && match.winner && (
              <>
                {' '}
                · Ganador:{' '}
                <span className="font-semibold text-win">
                  {match.participants.find((p) => p.registration === match.winner)?.registration_name}
                </span>
              </>
            )}
          </p>
        ) : (
          <MatchBox match={match} compact className="max-w-md" />
        )}
      </div>
      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
        <StatusBadge status={match.status} />
        {stream && (
          <a
            href={stream.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-300 transition hover:text-accent"
          >
            <Broadcast size={14} /> {platformLabel[stream.platform]}
          </a>
        )}
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: Match['status'] }) {
  const tone = status === 'live' ? 'live' : status === 'completed' ? 'win' : status === 'canceled' ? 'accent' : 'neutral'
  return <Badge tone={tone}>{matchStatusLabel[status]}</Badge>
}

// -------------------------------------------------------------- bracket

const HEADER = 36

export function Bracket({ section, onMatchClick }: { section: BracketSection; onMatchClick?: OnMatch }) {
  const { items, lines, width, height } = useMemo(() => layoutBracket(section.rounds), [section.rounds])
  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto overflow-y-hidden px-4 pb-4">
      <div className="relative" style={{ width, height: height + HEADER }}>
        {section.rounds.map((round, column) => (
          <div
            key={round.round}
            className="absolute top-0 flex h-7 items-center justify-center rounded-lg bg-ink-800 text-xs font-semibold uppercase tracking-wide text-ink-300"
            style={{ left: column * (BOX_W + GAP_X), width: BOX_W }}
          >
            {roundLabel(round.matches[0]?.label ?? '', round.round)}
          </div>
        ))}
        <svg className="absolute left-0" style={{ top: HEADER }} width={width} height={height} aria-hidden>
          {lines.map((line) => (
            <motion.path
              key={line.id}
              d={line.d}
              fill="none"
              strokeWidth={1.5}
              className={line.done ? 'stroke-win/60' : 'stroke-white/15'}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </svg>
        {items.map((item, index) => (
          <motion.div
            key={item.match.id}
            className="absolute"
            style={{ left: item.x, top: item.y + HEADER, width: BOX_W }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.5), type: 'spring', stiffness: 200, damping: 24 }}
          >
            <MatchBox match={item.match} compact onClick={onMatchClick} />
            {item.match.label === 'Third place' && (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Tercer lugar</p>
            )}
            {item.match.scheduled_at && item.match.status !== 'completed' && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
                <Clock size={11} /> {formatDate(item.match.scheduled_at, true)}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const SECTION_TITLES: Record<string, string> = {
  upper: 'Upper bracket',
  lower: 'Lower bracket',
  final: 'Gran final',
}

/** Brackets of a stage. In a double elimination: upper, lower and grand
 * final, each with its title (like Liquipedia). */
export function BracketSections({ sections, onMatchClick }: { sections: BracketSection[]; onMatchClick?: OnMatch }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={`${section.group ?? ''}-${section.bracket ?? ''}`}>
          {section.bracket && (
            <p
              className={cx(
                'mb-3 text-xs font-semibold uppercase tracking-[0.18em]',
                section.bracket === 'lower' ? 'text-ink-400' : 'text-accent',
              )}
            >
              {SECTION_TITLES[section.bracket]}
            </p>
          )}
          <Bracket section={section} onMatchClick={onMatchClick} />
        </div>
      ))}
    </div>
  )
}

// --------------------------------------------------------------- groups

export function GroupTable({
  group,
  advance,
  freeForAll,
}: {
  group: GroupStandings
  advance: number
  freeForAll?: boolean
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h4 className="font-display font-semibold">{group.group ?? 'Clasificación'}</h4>
        {advance > 0 && <span className="text-xs text-ink-400">Clasifican {advance}</span>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400">
            <th className="w-10 py-2 pl-4 font-medium">#</th>
            <th className="py-2 font-medium">Equipo</th>
            <th className="w-12 py-2 text-center font-medium" title="Jugados">
              PJ
            </th>
            {freeForAll ? (
              <th className="w-12 py-2 text-center font-medium" title="Victorias">
                1ros
              </th>
            ) : (
              <>
                <th className="hidden w-16 py-2 text-center font-medium sm:table-cell" title="Ganados-Empatados-Perdidos">
                  G-E-P
                </th>
                <th className="hidden w-12 py-2 text-center font-medium sm:table-cell" title="Diferencia">
                  Dif
                </th>
              </>
            )}
            <th className="w-14 py-2 pr-4 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {group.standings.map((row) => {
            // Highlight the qualifying places only once the group has started:
            // with everyone at 0 points the order means nothing yet.
            const started = group.standings.some((r) => r.played > 0)
            const qualifies = started && row.rank <= advance
            return (
              <tr key={row.registration.id} className={cx(qualifies && 'bg-win-soft/60')}>
                <td className="py-2.5 pl-4">
                  <span
                    className={cx(
                      'grid size-6 place-items-center rounded-md font-mono text-xs',
                      qualifies ? 'bg-win/20 text-win' : 'text-ink-400',
                    )}
                  >
                    {row.rank}
                  </span>
                </td>
                <td className="py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo src={row.registration.logo} name={row.registration.display_name} size={22} />
                    <span className="truncate font-medium">{row.registration.display_name}</span>
                  </div>
                </td>
                <td className="py-2.5 text-center font-mono tabular-nums text-ink-300">{row.played}</td>
                {freeForAll ? (
                  <td className="py-2.5 text-center font-mono tabular-nums text-ink-300">{row.wins}</td>
                ) : (
                  <>
                    <td className="hidden py-2.5 text-center font-mono tabular-nums text-ink-300 sm:table-cell">
                      {row.wins}-{row.draws}-{row.losses}
                    </td>
                    <td className="hidden py-2.5 text-center font-mono tabular-nums text-ink-300 sm:table-cell">
                      {row.score_diff > 0 ? `+${row.score_diff}` : row.score_diff}
                    </td>
                  </>
                )}
                <td className="py-2.5 pr-4 text-right font-mono font-semibold tabular-nums">{row.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Matches of a group listed by round (Liquipedia "Matches" box). */
export function GroupMatches({ matches, onMatchClick }: { matches: Match[]; onMatchClick?: OnMatch }) {
  const rounds = useMemo(() => {
    const map = new Map<number, Match[]>()
    for (const match of matches) map.set(match.round, [...(map.get(match.round) ?? []), match])
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [matches])
  return (
    <div className="space-y-3">
      {rounds.map(([round, items]) => (
        <div key={round}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Fecha {round}</p>
          <div className="grid gap-2">
            {items.map((match) =>
              match.participants.length > 2 ? (
                <FreeForAllResult key={match.id} match={match} onClick={onMatchClick} />
              ) : (
                <MatchBox key={match.id} match={match} compact onClick={onMatchClick} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function FreeForAllResult({ match, onClick }: { match: Match; onClick?: OnMatch }) {
  const rows = [...match.participants].sort(
    (a, b) => (a.placement ?? 99) - (b.placement ?? 99) || b.score - a.score,
  )
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick ? () => onClick(match) : undefined}
      className={cx(
        'block w-full overflow-hidden rounded-xl border border-white/[0.07] bg-ink-850 text-left',
        onClick && 'transition hover:border-accent/60',
      )}
    >
      {match.status !== 'completed' ? (
        <p className="px-3 py-2.5 text-sm text-ink-400">
          {match.participants.length} participantes · {match.scheduled_at ? formatDate(match.scheduled_at, true) : 'Sin fecha'}
        </p>
      ) : (
        <ol className="divide-y divide-white/[0.04]">
          {rows.map((row) => (
            <li key={row.id} className={cx('flex h-9 items-center gap-2.5 px-3 text-sm', row.placement === 1 && 'bg-win-soft')}>
              <span className="w-5 font-mono text-xs text-ink-400">{row.placement}</span>
              <TeamLogo src={row.logo} name={row.registration_name ?? '?'} size={20} />
              <span className="flex-1 truncate">{row.registration_name}</span>
              {row.placement === 1 && <Trophy size={14} weight="fill" className="text-win" />}
              <span className="font-mono tabular-nums text-ink-300">{row.score} pts</span>
            </li>
          ))}
        </ol>
      )}
    </Tag>
  )
}

// --------------------------------------------------------------- stream

export function StreamEmbed({ stream, className }: { stream: Pick<Stream, 'url' | 'title' | 'platform'>; className?: string }) {
  const embed = toEmbed(stream.url, window.location.hostname)
  if (!embed.src) {
    return (
      <a
        href={stream.url}
        target="_blank"
        rel="noreferrer"
        className={cx(
          'surface group flex aspect-video flex-col items-center justify-center gap-3 text-ink-300 transition hover:text-ink-100',
          className,
        )}
      >
        <Broadcast size={40} weight="duotone" className="text-accent" />
        <span className="font-display text-lg font-semibold">{stream.title}</span>
        <span className="inline-flex items-center gap-1.5 text-sm">
          Ver en {platformLabel[embed.platform]} <ArrowSquareOut size={14} />
        </span>
      </a>
    )
  }
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900', className)}>
      <iframe
        src={embed.src}
        title={stream.title}
        className="aspect-video w-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
    </div>
  )
}
