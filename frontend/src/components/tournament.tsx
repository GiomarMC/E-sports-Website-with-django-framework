import { ArrowRight, ArrowSquareOut, Broadcast, Trophy } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { type ReactNode, useMemo } from 'react'
import { formatDate, formatTime, matchStatusLabel, platformLabel } from '../lib/format'
import { toEmbed } from '../lib/streams'
import { BOX_W, GAP_X, hasScore, layoutBracket, layoutDoubleBracket, ROUND_HEADER, roundLabel } from '../lib/tournament'
import type { BracketSection, GroupStandings, Match, MatchParticipant, Stream } from '../lib/types'
import { Badge, cx, TeamLogo } from './ui'

type OnMatch = (match: Match) => void

/** Both sides of a 1 vs 1 match, in slot order. In a bye the team goes first
 * and the empty slot ("pase directo") last. */
function sides(match: Match) {
  return [...match.participants].sort((x, y) =>
    match.is_bye ? Number(!x.registration) - Number(!y.registration) : x.slot - y.slot,
  )
}

function outcome(match: Match, participant: MatchParticipant | undefined) {
  const decided = !match.is_bye && match.status === 'completed' && match.winner !== null
  const isWinner = decided && !!participant?.registration && participant.registration === match.winner
  return { isWinner, isLoser: decided && !isWinner }
}

/** Score cell like Liquipedia: the games won or, when the admin only set the
 * winner, W / L. */
function scoreText(match: Match, participant: MatchParticipant | undefined) {
  if (match.is_bye || match.status !== 'completed') return ''
  if (hasScore(match)) return String(participant?.score ?? 0)
  if (match.winner === null) return '-'
  return participant?.registration === match.winner ? 'W' : 'L'
}

// ------------------------------------------------------- bracket match

function BracketLine({ participant, match }: { participant: MatchParticipant | undefined; match: Match }) {
  // A bye is not a played match: the team simply passes to the next round,
  // so it is not shown as a winner.
  const bye = match.is_bye
  const name = participant?.registration_name ?? (bye ? 'Pase directo' : 'Por definir')
  const { isWinner, isLoser } = outcome(match, participant)
  return (
    <div className="flex h-8 items-stretch">
      <div className={cx('flex min-w-0 flex-1 items-center gap-2 px-2.5', isWinner && 'bg-win-soft')}>
        {participant?.registration ? (
          <TeamLogo src={participant.logo} name={name} size={18} />
        ) : bye ? (
          <ArrowRight size={14} className="mx-[2px] shrink-0 text-ink-400" />
        ) : (
          <span className="size-[18px] shrink-0 rounded border border-dashed border-white/10" />
        )}
        <span
          className={cx(
            'min-w-0 flex-1 truncate text-[13px]',
            isWinner ? 'font-semibold text-ink-100' : isLoser ? 'text-ink-400' : 'text-ink-300',
            !participant?.registration && (bye ? 'text-[11px] uppercase tracking-wide text-ink-400' : 'italic text-ink-600'),
          )}
        >
          {name}
        </span>
      </div>
      <span
        className={cx(
          'grid w-8 shrink-0 place-items-center border-l border-white/[0.06] font-mono text-[13px] tabular-nums',
          isWinner ? 'bg-win/20 font-bold text-win' : 'bg-ink-800 text-ink-400',
        )}
      >
        {scoreText(match, participant)}
      </span>
    </div>
  )
}

/** Match of a bracket: two stacked lines with the score on the right. */
export function MatchBox({
  match,
  className,
  onClick,
}: {
  match: Match
  className?: string
  /** Admin: makes the match clickable (e.g. to define the winner). */
  onClick?: OnMatch
}) {
  const [a, b] = sides(match)
  const clickable = !!onClick && !match.is_bye
  const Tag = clickable ? 'button' : 'div'
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={clickable ? () => onClick(match) : undefined}
      title={clickable ? 'Definir o corregir el resultado' : undefined}
      className={cx(
        'block w-full overflow-hidden rounded-md border bg-ink-850 text-left divide-y divide-white/[0.06]',
        match.status === 'live'
          ? 'border-live/60 shadow-[inset_2px_0_0_var(--color-live)]'
          : match.is_bye
            ? 'border-dashed border-white/10'
            : 'border-white/[0.09]',
        clickable && 'transition hover:border-accent/60 hover:bg-ink-800',
        className,
      )}
    >
      <BracketLine participant={a} match={match} />
      <BracketLine participant={b} match={match} />
    </Tag>
  )
}

// ---------------------------------------------------------- match strip

function StripSide({
  participant,
  match,
  align,
  large,
}: {
  participant: MatchParticipant | undefined
  match: Match
  align: 'left' | 'right'
  large?: boolean
}) {
  const name = participant?.registration_name ?? 'Por definir'
  const { isWinner, isLoser } = outcome(match, participant)
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', align === 'left' && 'flex-row-reverse text-right')}>
      {participant?.registration ? (
        <TeamLogo src={participant.logo} name={name} size={large ? 32 : 22} />
      ) : (
        <span className={cx('shrink-0 rounded-md border border-dashed border-white/10', large ? 'size-8' : 'size-[22px]')} />
      )}
      <span
        className={cx(
          'min-w-0 truncate',
          large ? 'font-display text-base sm:text-lg' : 'text-sm',
          isWinner ? 'font-semibold text-ink-100' : isLoser ? 'text-ink-400' : 'text-ink-100',
          !participant?.registration && 'italic text-ink-600',
        )}
      >
        {name}
      </span>
    </div>
  )
}

/** Center of a strip: the result, "vivo", or the time of the match. */
function StripCenter({ match, large }: { match: Match; large?: boolean }) {
  const [a, b] = sides(match)
  if (match.status === 'completed') {
    const digit = (p: MatchParticipant | undefined) => (
      <span className={cx('w-[1.4ch] text-center', outcome(match, p).isWinner ? 'text-win' : 'text-ink-300')}>
        {scoreText(match, p)}
      </span>
    )
    return (
      <span
        className={cx(
          'inline-flex items-center justify-center gap-1 rounded-md bg-ink-800 font-mono font-semibold tabular-nums',
          large ? 'px-3 py-1.5 text-xl' : 'px-2 py-1 text-sm',
        )}
      >
        {digit(a)}
        <span className="text-ink-600">:</span>
        {digit(b)}
      </span>
    )
  }
  if (match.status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-live/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-live">
        <span className="size-1.5 animate-[live-pulse_1.6s_ease-in-out_infinite] rounded-full bg-live" />
        Vivo
      </span>
    )
  }
  if (match.status === 'canceled') return <span className="text-xs text-ink-400">Cancelado</span>
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className={cx('font-mono font-semibold tabular-nums text-ink-300', large ? 'text-lg' : 'text-xs')}>
        {match.scheduled_at ? formatTime(match.scheduled_at) : 'vs'}
      </span>
      {match.scheduled_at && !large && (
        <span className="text-[10px] text-ink-400">{formatDate(match.scheduled_at).replace(/ \d{4}$/, '')}</span>
      )}
    </span>
  )
}

/** Symmetric match row (Liquipedia match list): team, result, team. */
export function MatchStrip({ match, onClick, large }: { match: Match; onClick?: OnMatch; large?: boolean }) {
  const [a, b] = sides(match)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick ? () => onClick(match) : undefined}
      title={onClick ? 'Definir o corregir el resultado' : undefined}
      className={cx(
        'grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-left',
        large ? 'px-4 py-4 sm:px-6' : 'px-3 py-2',
        onClick && 'transition hover:bg-white/[0.03]',
      )}
    >
      <StripSide participant={a} match={match} align="left" large={large} />
      <div className={cx('flex justify-center', large ? 'min-w-24' : 'min-w-16')}>
        <StripCenter match={match} large={large} />
      </div>
      <StripSide participant={b} match={match} align="right" large={large} />
    </Tag>
  )
}

/** Wide match card for schedules (Liquipedia upcoming match box). */
export function MatchCard({ match, gameName }: { match: Match; gameName?: string }) {
  const stream = match.streams.find((s) => s.is_live) ?? match.streams[0]
  const ffa = match.participants.length > 2
  const round = match.group_name || ffa ? `Fecha ${match.round}` : roundLabel(match.label, match.round)
  return (
    <div className={cx('surface overflow-hidden', match.status === 'live' && 'border-live/40')}>
      {ffa ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
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
          <span className="font-mono text-lg font-semibold tabular-nums text-ink-300">{formatTime(match.scheduled_at)}</span>
        </div>
      ) : (
        <MatchStrip match={match} large />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.06] bg-ink-850/70 px-4 py-2.5 text-xs text-ink-400 sm:px-6">
        {gameName && <span className="font-semibold text-ink-300">{gameName}</span>}
        <span>{match.stage_name}</span>
        {match.group_name && <span>{match.group_name}</span>}
        <span>{round}</span>
        <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-300">Bo{match.best_of}</span>
        <span className="ml-auto flex items-center gap-3">
          {match.scheduled_at && <span>{formatDate(match.scheduled_at, true)}</span>}
          {stream && (
            <a
              href={stream.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-ink-300 transition hover:text-accent"
            >
              <Broadcast size={14} /> {platformLabel[stream.platform]}
            </a>
          )}
          <StatusBadge status={match.status} />
        </span>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: Match['status'] }) {
  const tone = status === 'live' ? 'live' : status === 'completed' ? 'win' : status === 'canceled' ? 'accent' : 'neutral'
  return <Badge tone={tone}>{matchStatusLabel[status]}</Badge>
}

// -------------------------------------------------------------- bracket

type Layout = ReturnType<typeof layoutBracket>
type Round = BracketSection['rounds'][number]

function RoundHeader({ round, x, y }: { round: Round; x: number; y: number }) {
  return (
    <div
      className="absolute flex h-8 items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-ink-800 px-3"
      style={{ left: x, top: y, width: BOX_W }}
    >
      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-100">
        {roundLabel(round.matches[0]?.label ?? '', round.round)}
      </span>
      {round.matches[0] && <span className="shrink-0 font-mono text-[11px] text-ink-400">Bo{round.matches[0].best_of}</span>}
    </div>
  )
}

/** Matches and the lines between them; ``children`` adds the headers. */
function BracketCanvas({
  layout,
  top = 0,
  onMatchClick,
  children,
}: {
  layout: Layout
  /** Room above the matches (for the round headers). */
  top?: number
  onMatchClick?: OnMatch
  children: ReactNode
}) {
  const { items, lines, width, height } = layout
  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto overflow-y-hidden px-4 pb-4">
      <div className="relative" style={{ width, height: height + top }}>
        {children}
        <svg className="absolute left-0" style={{ top }} width={width} height={height} aria-hidden>
          {lines.map((line) => (
            <motion.path
              key={line.id}
              d={line.d}
              fill="none"
              strokeWidth={1.5}
              className={line.done ? 'stroke-win/50' : 'stroke-white/20'}
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
            style={{ left: item.x, top: item.y + top, width: BOX_W }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.5), type: 'spring', stiffness: 200, damping: 24 }}
          >
            <MatchBox match={item.match} onClick={onMatchClick} />
            <p className="mt-1 flex h-4 items-center gap-2 truncate text-[11px] text-ink-400" style={{ maxWidth: BOX_W }}>
              {item.match.label === 'Third place' && (
                <span className="font-semibold uppercase tracking-wide text-ink-300">Tercer lugar</span>
              )}
              {item.match.status === 'live' ? (
                <span className="font-semibold uppercase tracking-wide text-live">En vivo</span>
              ) : (
                item.match.scheduled_at &&
                item.match.status !== 'completed' && <span>{formatDate(item.match.scheduled_at, true)}</span>
              )}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function Bracket({ section, onMatchClick }: { section: BracketSection; onMatchClick?: OnMatch }) {
  const layout = useMemo(() => layoutBracket(section.rounds), [section.rounds])
  return (
    <BracketCanvas layout={layout} top={ROUND_HEADER} onMatchClick={onMatchClick}>
      {section.rounds.map((round, column) => (
        <RoundHeader key={round.round} round={round} x={column * (BOX_W + GAP_X)} y={0} />
      ))}
    </BracketCanvas>
  )
}

/** A double elimination in a single picture: upper, lower and grand final. */
function DoubleBracket({ sections, onMatchClick }: { sections: BracketSection[]; onMatchClick?: OnMatch }) {
  const layout = useMemo(() => layoutDoubleBracket(sections), [sections])
  return (
    <BracketCanvas layout={layout} onMatchClick={onMatchClick}>
      {layout.headers.map((header) => (
        <RoundHeader key={header.key} round={header.round} x={header.x} y={header.y} />
      ))}
    </BracketCanvas>
  )
}

/** Brackets of a stage. A double elimination (upper, lower and grand final)
 * is drawn as one bracket, like Liquipedia. */
export function BracketSections({ sections, onMatchClick }: { sections: BracketSection[]; onMatchClick?: OnMatch }) {
  const double = sections.filter((section) => section.bracket)
  const single = sections.filter((section) => !section.bracket)
  return (
    <div className="space-y-8">
      {single.map((section) => (
        <Bracket key={section.group ?? ''} section={section} onMatchClick={onMatchClick} />
      ))}
      {double.length > 0 && <DoubleBracket sections={double} onMatchClick={onMatchClick} />}
    </div>
  )
}

// --------------------------------------------------------------- groups

const sign = (value: number) => (value > 0 ? `+${value}` : String(value))

/** Group standings like Liquipedia: matches and games won, colored by the
 * places that qualify (upper) or go to the lower bracket. */
export function GroupTable({
  group,
  advance,
  lowerAdvance = 0,
  freeForAll,
}: {
  group: GroupStandings
  advance: number
  /** Next places that start in the lower bracket. */
  lowerAdvance?: number
  freeForAll?: boolean
}) {
  // Highlight the qualifying places only once the group has started: with
  // everyone at 0 points the order means nothing yet.
  const started = group.standings.some((r) => r.played > 0)
  const draws = group.standings.some((r) => r.draws > 0)
  const place = (rank: number) =>
    !started ? null : rank <= advance ? 'up' : rank <= advance + lowerAdvance ? 'lower' : 'out'
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-ink-850/70 px-4 py-2.5">
        <h4 className="font-display font-semibold">{group.group ?? 'Clasificación'}</h4>
        {advance > 0 && (
          <span className="text-xs text-ink-400">
            Clasifican {advance}
            {lowerAdvance > 0 && ` · ${lowerAdvance} al lower`}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.05] text-left text-[10px] uppercase tracking-[0.12em] text-ink-400">
            <th className="w-11 py-2 pl-4 font-semibold">#</th>
            <th className="py-2 font-semibold">{freeForAll ? 'Participante' : 'Equipo'}</th>
            <th className="w-12 py-2 text-center font-semibold" title="Jugados">
              PJ
            </th>
            {freeForAll ? (
              <th className="w-12 py-2 text-center font-semibold" title="Primeros puestos">
                1ros
              </th>
            ) : (
              <>
                <th className="w-16 py-2 text-center font-semibold" title={draws ? 'Ganados-Empatados-Perdidos' : 'Ganados-Perdidos'}>
                  {draws ? 'G-E-P' : 'G-P'}
                </th>
                <th className="hidden w-16 py-2 text-center font-semibold sm:table-cell" title="Partidas ganadas-perdidas">
                  Juegos
                </th>
                <th className="hidden w-12 py-2 text-center font-semibold sm:table-cell" title="Diferencia de partidas">
                  Dif
                </th>
              </>
            )}
            <th className="w-14 py-2 pr-4 text-right font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {group.standings.map((row) => {
            const status = place(row.rank)
            return (
              <tr
                key={row.registration.id}
                className={cx(status === 'up' && 'bg-win-soft/50', status === 'lower' && 'bg-warn-soft/50')}
              >
                <td
                  className={cx(
                    'py-2 pl-4',
                    status === 'up' && 'shadow-[inset_3px_0_0_var(--color-win)]',
                    status === 'lower' && 'shadow-[inset_3px_0_0_var(--color-warn)]',
                  )}
                >
                  <span
                    className={cx(
                      'font-mono text-xs tabular-nums',
                      status === 'up' ? 'text-win' : status === 'lower' ? 'text-warn' : 'text-ink-400',
                    )}
                  >
                    {row.rank}.
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo src={row.registration.logo} name={row.registration.display_name} size={22} />
                    <span className={cx('truncate font-medium', status === 'out' && 'text-ink-300')}>
                      {row.registration.display_name}
                    </span>
                  </div>
                </td>
                <td className="py-2 text-center font-mono tabular-nums text-ink-400">{row.played}</td>
                {freeForAll ? (
                  <td className="py-2 text-center font-mono tabular-nums text-ink-300">{row.wins}</td>
                ) : (
                  <>
                    <td className="py-2 text-center font-mono tabular-nums text-ink-100">
                      {row.wins}-{draws ? `${row.draws}-` : ''}
                      {row.losses}
                    </td>
                    <td className="hidden py-2 text-center font-mono tabular-nums text-ink-300 sm:table-cell">
                      {row.score_for}-{row.score_against}
                    </td>
                    <td
                      className={cx(
                        'hidden py-2 text-center font-mono tabular-nums sm:table-cell',
                        row.score_diff > 0 ? 'text-win' : row.score_diff < 0 ? 'text-accent' : 'text-ink-400',
                      )}
                    >
                      {sign(row.score_diff)}
                    </td>
                  </>
                )}
                <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums">{row.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {started && advance > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.05] px-4 py-2 text-[11px] text-ink-400">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-win" /> Clasifica{lowerAdvance > 0 && ' al upper'}
          </span>
          {lowerAdvance > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-warn" /> Pasa al lower
            </span>
          )}
        </div>
      )}
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
  const played = matches.filter((m) => m.status === 'completed').length
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-ink-850/70 px-4 py-2.5">
        <h4 className="font-display font-semibold">Matchs</h4>
        <span className="font-mono text-xs tabular-nums text-ink-400">
          {played}/{matches.length} jugados
          {matches[0] && ` · Bo${matches[0].best_of}`}
        </span>
      </div>
      {rounds.map(([round, items]) => (
        <div key={round}>
          <p className="border-b border-white/[0.04] bg-ink-950/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-400">
            Fecha {round}
          </p>
          <div className="divide-y divide-white/[0.04]">
            {items.map((match) =>
              match.participants.length > 2 ? (
                <div key={match.id} className="p-2">
                  <FreeForAllResult match={match} onClick={onMatchClick} />
                </div>
              ) : (
                <MatchStrip key={match.id} match={match} onClick={onMatchClick} />
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
