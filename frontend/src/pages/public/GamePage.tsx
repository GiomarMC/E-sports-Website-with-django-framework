import {
  ArrowRight,
  ArrowSquareOut,
  Broadcast,
  CalendarBlank,
  Crown,
  DownloadSimple,
  FilePdf,
  Info,
  ListNumbers,
  Scroll,
  Timer,
  TreeStructure,
  UsersThree,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { TournamentContacts } from '../../components/contacts'
import { Countdown } from '../../components/countdown'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  BracketSections,
  GroupMatches,
  GroupTable,
  MatchCard,
  MatchStrip,
  StreamEmbed,
} from '../../components/tournament'
import { Badge, Button, cx, EmptyState, ErrorState, Select, Skeleton, Tabs, TeamLogo } from '../../components/ui'
import {
  formatDate,
  formatDay,
  formatMoney,
  formatTime,
  playersLabel,
  stageStatusLabel,
  stageTypeLabel,
  tournamentStatusLabel,
} from '../../lib/format'
import {
  useBracket,
  useGame,
  useParticipants,
  useSchedule,
  useStages,
  useStandings,
  useSettings,
  useStreams,
  useTournaments,
} from '../../lib/queries'
import type { Game, Stage, Tournament } from '../../lib/types'
import { tournamentMilestone } from '../../lib/countdown'
import { currentTournament, groupByDay } from '../../lib/tournament'
import { useNow } from '../../lib/useNow'

type Tab = 'resumen' | 'reglas' | 'equipos' | 'partidas' | 'cronograma' | 'stream'

export default function GamePage() {
  const gameId = Number(useParams().gameId)
  const [search, setSearch] = useSearchParams()
  const game = useGame(gameId)
  const tournaments = useTournaments({ game: gameId })
  const [tab, setTab] = useState<Tab>('resumen')

  const selected = useMemo(() => {
    const list = tournaments.data ?? []
    const requested = Number(search.get('torneo'))
    return list.find((t) => t.id === requested) ?? currentTournament(list, gameId)
  }, [tournaments.data, search, gameId])

  if (game.isPending) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-10 md:px-8">
        <Skeleton className="h-72" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (game.isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8">
        <ErrorState message={game.error.status === 404 ? 'Este juego no existe.' : game.error.message} />
      </div>
    )
  }

  const tabs: { value: Tab; label: string; icon: ReactNode }[] = [
    { value: 'resumen', label: 'Resumen', icon: <Info size={16} /> },
    { value: 'reglas', label: 'Reglas', icon: <Scroll size={16} /> },
    { value: 'equipos', label: game.data.type_of_game === 'team' ? 'Equipos' : 'Jugadores', icon: <UsersThree size={16} /> },
    { value: 'partidas', label: 'Partidas', icon: <TreeStructure size={16} /> },
    { value: 'cronograma', label: 'Cronograma', icon: <CalendarBlank size={16} /> },
    { value: 'stream', label: 'Stream', icon: <Broadcast size={16} /> },
  ]

  return (
    <>
      <GameHero
        game={game.data}
        tournament={selected}
        tournaments={tournaments.data ?? []}
        onSelect={(id) => setSearch({ torneo: String(id) }, { replace: true })}
      />
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="sticky top-16 z-30 -mx-4 bg-ink-950/80 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8">
          <Tabs tabs={tabs} value={tab} onChange={setTab} layoutId="game-tabs" />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="pt-8"
          >
            {tab === 'resumen' && <Overview game={game.data} tournament={selected} onTab={setTab} />}
            {tab === 'reglas' && <Rules game={game.data} />}
            {!selected && tab !== 'resumen' && tab !== 'reglas' && tab !== 'stream' ? (
              <NoTournament />
            ) : (
              <>
                {tab === 'equipos' && selected && <Participants tournament={selected} />}
                {tab === 'partidas' && selected && <Stages tournament={selected} />}
                {tab === 'cronograma' && selected && <Schedule tournament={selected} />}
              </>
            )}
            {tab === 'stream' && <GameStreams gameId={game.data.id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}

function NoTournament() {
  return (
    <EmptyState
      icon={<CalendarBlank size={24} />}
      title="Todavía no hay torneo"
      description="Cuando se publique el torneo de este juego aparecerá aquí."
    />
  )
}

function GameHero({
  game,
  tournament,
  tournaments,
  onSelect,
}: {
  game: Game
  tournament?: Tournament
  tournaments: Tournament[]
  onSelect: (id: number) => void
}) {
  const now = useNow(30000)
  const { data: settings } = useSettings()
  const milestone = tournament && tournamentMilestone(tournament, now, settings)
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        {game.images && (
          <motion.img
            src={game.images}
            alt=""
            initial={{ scale: 1.08, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="size-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 to-transparent" />
      </div>
      <div className="relative mx-auto grid max-w-[1400px] gap-8 px-4 pt-16 pb-10 md:px-8 md:pt-24 lg:grid-cols-[1.2fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 110, damping: 20 }}>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge>{game.type_of_game === 'team' ? 'Equipos' : 'Individual'}</Badge>
            <Badge>{playersLabel(game.min_players, game.max_players)}</Badge>
            {tournament && (
              <Badge tone={tournament.status === 'ongoing' ? 'live' : tournament.status === 'completed' ? 'win' : 'neutral'}>
                {tournamentStatusLabel[tournament.status]}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight md:text-7xl">{game.name}</h1>
          {tournament && <p className="mt-4 font-display text-xl text-ink-300">{tournament.name}</p>}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {tournament?.registration.is_open && (
              <Link to={`/torneos/${tournament.id}/inscripcion`}>
                <Button size="lg" icon={<ArrowRight size={18} />} className="flex-row-reverse">
                  Inscribirse
                </Button>
              </Link>
            )}
            {tournaments.length > 1 && tournament && (
              <Select
                aria-label="Edición del torneo"
                value={tournament.id}
                onChange={(event) => onSelect(Number(event.target.value))}
                className="w-auto min-w-56"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </motion.div>
        {milestone && tournament && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 110, damping: 20 }}
            className="self-end rounded-3xl border border-white/10 bg-ink-950/65 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:w-fit sm:p-8 lg:justify-self-end"
          >
            <p
              className={cx(
                'flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em]',
                milestone.kind === 'closes' ? 'text-warn' : milestone.kind === 'starts' ? 'text-win' : 'text-ink-200',
              )}
            >
              <Timer size={18} weight="bold" />
              {milestone.label}
            </p>
            <Countdown key={milestone.target} target={milestone.target} size="lg" className="mt-5" />
            <p className="mt-5 text-sm text-ink-300 first-letter:uppercase">
              {formatDay(milestone.target)} · {formatTime(milestone.target)}
            </p>
            {milestone.kind !== 'starts' && (
              <p className="mt-1 text-xs text-ink-400">El torneo empieza el {formatDate(tournament.start_date, true)}</p>
            )}
          </motion.div>
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------ overview

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-ink-100">{children}</dd>
    </div>
  )
}

function stageDetails(stage: Stage) {
  const parts = [`Bo${stage.best_of}`]
  if (stage.stage_type === 'double_elimination') {
    parts[0] = `upper Bo${stage.best_of}`
    parts.push(`lower Bo${stage.lower_best_of ?? stage.best_of}`)
    parts.push(`gran final Bo${stage.final_best_of ?? stage.best_of}`)
  } else if (stage.final_best_of && stage.final_best_of !== stage.best_of) {
    parts.push(`final Bo${stage.final_best_of}`)
  }
  if (stage.stage_type === 'round_robin') {
    parts.push(`${stage.number_of_groups} ${stage.number_of_groups === 1 ? 'grupo' : 'grupos'}`)
    if (stage.round_robin_legs === 2) parts.push('ida y vuelta')
  }
  if (stage.stage_type === 'free_for_all') parts.push(`${stage.ffa_rounds} rondas`)
  if (stage.advance_per_group > 0) parts.push(`clasifican ${stage.advance_per_group} por grupo`)
  if (stage.lower_advance_per_group > 0) parts.push(`${stage.lower_advance_per_group} más al lower`)
  if (stage.third_place_match) parts.push('con tercer lugar')
  return parts.join(' · ')
}

function Overview({
  game,
  tournament,
  onTab,
}: {
  game: Game
  tournament?: Tournament
  onTab: (tab: Tab) => void
}) {
  const stages = useStages(tournament?.id ?? 0)
  const now = useNow(30000)
  const startsAt = tournament?.registration.starts_at
  const notYet = !!startsAt && Date.parse(startsAt) > now
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div className="space-y-10">
        <section>
          <h2 className="mb-3 font-display text-2xl font-semibold">Sobre el juego</h2>
          <p className="max-w-[70ch] whitespace-pre-line leading-relaxed text-ink-300">{game.description}</p>
          {tournament?.description && (
            <p className="mt-4 max-w-[70ch] whitespace-pre-line leading-relaxed text-ink-300">{tournament.description}</p>
          )}
        </section>
        {tournament && (
          <section>
            <h2 className="mb-4 font-display text-2xl font-semibold">Formato</h2>
            {stages.isPending ? (
              <Skeleton className="h-32" />
            ) : stages.data?.length === 1 ? (
              <div className="surface p-5">
                <p className="font-display text-lg font-semibold">{stageTypeLabel[stages.data[0].stage_type]}</p>
                <p className="mt-1 text-sm text-ink-400">{stageDetails(stages.data[0])}</p>
              </div>
            ) : stages.data?.length ? (
              <ol className="relative space-y-6 border-l border-white/10 pl-6">
                {stages.data.map((stage) => (
                  <li key={stage.id} className="relative">
                    <span
                      className={cx(
                        'absolute -left-[31px] top-1 size-3 rounded-full border-2 border-ink-950',
                        stage.status === 'completed' ? 'bg-win' : stage.status === 'ongoing' ? 'bg-live' : 'bg-ink-600',
                      )}
                    />
                    <p className="font-display text-lg font-semibold">
                      {stage.name}{' '}
                      <span className="ml-2 align-middle text-xs font-normal text-ink-400">{stageStatusLabel[stage.status]}</span>
                    </p>
                    <p className="text-sm text-ink-300">{stageTypeLabel[stage.stage_type]}</p>
                    <p className="mt-0.5 text-sm text-ink-400">{stageDetails(stage)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-400">El formato se publicará pronto.</p>
            )}
          </section>
        )}
        {tournament && <KeyDates tournament={tournament} now={now} />}
        {tournament && <OverviewMatches tournament={tournament} onTab={onTab} />}
        {tournament && <TeamsPreview tournament={tournament} onTab={onTab} />}
      </div>

      {tournament ? (
        <aside className="surface h-fit overflow-hidden lg:sticky lg:top-36">
          <div className="bg-accent px-5 py-3 text-center font-display text-lg font-semibold text-accent-ink">
            {tournament.name}
          </div>
          {game.images && <img src={game.images} alt="" className="aspect-video w-full object-cover" />}
          <dl className="divide-y divide-white/[0.05] px-5 py-2">
            <InfoRow label="Juego">{game.name}</InfoRow>
            <InfoRow label="Estado">{tournamentStatusLabel[tournament.status]}</InfoRow>
            <InfoRow label="Inicio">{formatDate(tournament.start_date, true)}</InfoRow>
            {tournament.end_date && <InfoRow label="Fin">{formatDate(tournament.end_date, true)}</InfoRow>}
            <InfoRow label="Modalidad">
              {game.type_of_game === 'team' ? 'Equipos' : 'Individual'} · {playersLabel(game.min_players, game.max_players)}
            </InfoRow>
            <InfoRow label="Inscripción">
              {Number(tournament.fee_per_player) > 0
                ? `${formatMoney(tournament.fee_per_player, tournament.currency)} por jugador`
                : 'Gratuita'}
            </InfoRow>
            <InfoRow label="Inscritos">
              {tournament.registration.registered}
              {tournament.max_registrations ? ` / ${tournament.max_registrations}` : ''}
            </InfoRow>
            <InfoRow label="Registro">
              <span className={tournament.registration.is_open ? 'text-win' : 'text-ink-300'}>
                {tournament.registration.is_open ? 'Abierto' : notYet ? 'Próximamente' : 'Cerrado'}
              </span>
              {notYet ? (
                <span className="block text-xs text-ink-400">Abre {formatDate(tournament.registration.starts_at, true)}</span>
              ) : tournament.registration.ends_at && (
                <span className="block text-xs text-ink-400">Hasta {formatDate(tournament.registration.ends_at, true)}</span>
              )}
            </InfoRow>
          </dl>
          <TournamentContacts tournamentId={tournament.id} className="border-t border-white/[0.05] px-5 py-4" />
          {tournament.registration.is_open && (
            <div className="p-5 pt-2">
              <Link to={`/torneos/${tournament.id}/inscripcion`}>
                <Button className="w-full" size="lg">
                  Inscribirse
                </Button>
              </Link>
            </div>
          )}
        </aside>
      ) : (
        <NoTournament />
      )}
    </div>
  )
}

/** Timeline of the tournament dates (Liquipedia infobox style). */
function KeyDates({ tournament, now }: { tournament: Tournament; now: number }) {
  const steps = [
    { label: 'Abren inscripciones', date: tournament.registration.starts_at },
    { label: 'Cierran inscripciones', date: tournament.registration.ends_at },
    { label: 'Inicio del torneo', date: tournament.start_date },
    { label: 'Fin del torneo', date: tournament.end_date },
  ]
    .filter((step): step is { label: string; date: string } => !!step.date)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  if (steps.length < 2) return null
  const next = steps.findIndex((step) => Date.parse(step.date) > now)
  return (
    <section>
      <h2 className="mb-4 font-display text-2xl font-semibold">Fechas clave</h2>
      <ol className="surface grid gap-5 p-5 sm:grid-cols-2 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">
        {steps.map((step, index) => {
          const done = next === -1 || index < next
          const current = index === next
          return (
            <li key={step.label} className="relative flex gap-3 xl:flex-col xl:gap-2">
              <span
                className={cx(
                  'mt-1 grid size-3 shrink-0 place-items-center rounded-full border-2 xl:mt-0',
                  done ? 'border-win bg-win' : current ? 'border-accent bg-accent-soft' : 'border-ink-600',
                )}
              />
              {index < steps.length - 1 && (
                <span className={cx('absolute top-1.5 left-4 hidden h-px w-[calc(100%-0.5rem)] xl:block', done ? 'bg-win/40' : 'bg-white/10')} />
              )}
              <div>
                <p className={cx('text-xs font-semibold uppercase tracking-wide', current ? 'text-accent' : 'text-ink-400')}>
                  {step.label}
                </p>
                <p className={cx('mt-0.5 text-sm', done ? 'text-ink-300' : 'text-ink-100')}>{formatDate(step.date, true)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Next matches of the tournament or, when none is left, the last results. */
function OverviewMatches({ tournament, onTab }: { tournament: Tournament; onTab: (tab: Tab) => void }) {
  const schedule = useSchedule(tournament.id)
  const matches = (schedule.data ?? []).filter((m) => !m.is_bye && m.participants.length === 2)
  const pending = matches.filter((m) => m.status === 'scheduled' || m.status === 'live')
  const done = matches.filter((m) => m.status === 'completed')
  const upcoming = pending.length > 0
  const list = upcoming ? pending.slice(0, 4) : done.slice(-4).reverse()
  if (!list.length) return null
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{upcoming ? 'Matchs por jugar' : 'Últimos resultados'}</h2>
        <button onClick={() => onTab('cronograma')} className="inline-flex items-center gap-1.5 text-sm text-ink-300 transition hover:text-ink-100">
          Ver cronograma <ArrowRight size={14} />
        </button>
      </div>
      <div className="surface divide-y divide-white/[0.05] overflow-hidden">
        {list.map((match) => (
          <div key={match.id}>
            <p className="flex flex-wrap gap-x-2 px-4 pt-2.5 text-[11px] text-ink-400">
              <span>{match.stage_name}</span>
              {match.group_name && <span>· {match.group_name}</span>}
              <span>· Bo{match.best_of}</span>
            </p>
            <MatchStrip match={match} />
          </div>
        ))}
      </div>
    </section>
  )
}

/** A few confirmed teams with a link to the full list. */
function TeamsPreview({ tournament, onTab }: { tournament: Tournament; onTab: (tab: Tab) => void }) {
  const participants = useParticipants(tournament.id)
  const list = participants.data ?? []
  if (!list.length) return null
  const team = tournament.type_of_game === 'team'
  const shown = list.slice(0, 8)
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">
          {list.length} {team ? (list.length === 1 ? 'equipo confirmado' : 'equipos confirmados') : list.length === 1 ? 'jugador confirmado' : 'jugadores confirmados'}
        </h2>
        <button onClick={() => onTab('equipos')} className="inline-flex items-center gap-1.5 text-sm text-ink-300 transition hover:text-ink-100">
          Ver todos <ArrowRight size={14} />
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {shown.map((registration) => (
          <li key={registration.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900 px-3 py-2.5">
            <TeamLogo src={registration.logo} name={registration.display_name} size={28} />
            <span className="min-w-0 truncate text-sm font-medium">{registration.display_name}</span>
          </li>
        ))}
      </ul>
      {list.length > shown.length && (
        <p className="mt-2 text-sm text-ink-400">y {list.length - shown.length} más.</p>
      )}
    </section>
  )
}

// --------------------------------------------------------------- rules

function Rules({ game }: { game: Game }) {
  if (!game.rules && !game.bases) {
    return (
      <EmptyState icon={<Scroll size={24} />} title="Reglas por publicar" description="El administrador del juego aún no sube las bases." />
    )
  }
  return (
    <div className={cx('grid gap-8', game.rules && game.bases && 'lg:grid-cols-[1fr_340px] lg:items-start')}>
      {game.rules && (
        <section>
          <h2 className="mb-4 font-display text-2xl font-semibold">Reglas</h2>
          <div className="surface max-w-[80ch] whitespace-pre-line p-6 leading-relaxed text-ink-300">{game.rules}</div>
        </section>
      )}
      {game.bases && <BasesCard url={game.bases} />}
    </div>
  )
}

/** Official rules PDF: a compact card that opens or downloads it (embedding
 * the PDF is blocked by many browsers and left a big empty box). */
function BasesCard({ url }: { url: string }) {
  const file = decodeURIComponent(url.split('/').pop() ?? 'bases.pdf')
  return (
    <section className="lg:sticky lg:top-36">
      <h2 className="mb-4 font-display text-2xl font-semibold">Bases oficiales</h2>
      <div className="surface max-w-md p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <FilePdf size={26} weight="duotone" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">Bases del torneo</p>
            <p className="truncate text-xs text-ink-400" title={file}>
              {file}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a href={url} target="_blank" rel="noreferrer">
            <Button className="w-full" icon={<ArrowSquareOut size={16} />}>
              Ver PDF
            </Button>
          </a>
          <a href={url} download>
            <Button variant="secondary" className="w-full" icon={<DownloadSimple size={16} />}>
              Descargar
            </Button>
          </a>
        </div>
      </div>
    </section>
  )
}

// -------------------------------------------------------- participants

function Participants({ tournament }: { tournament: Tournament }) {
  const participants = useParticipants(tournament.id)
  const [showRoster, setShowRoster] = useState(true)
  if (participants.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    )
  }
  if (!participants.data?.length) {
    return (
      <EmptyState
        icon={<UsersThree size={24} />}
        title="Aún no hay participantes confirmados"
        description="Los equipos aparecen aquí cuando el administrador confirma su inscripción."
        action={
          tournament.registration.is_open ? (
            <Link to={`/torneos/${tournament.id}/inscripcion`}>
              <Button>Inscribirse</Button>
            </Link>
          ) : undefined
        }
      />
    )
  }
  const team = tournament.type_of_game === 'team'
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">
          {participants.data.length} {team ? 'equipos' : 'jugadores'} confirmados
        </h2>
        {team && (
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={showRoster}
              onChange={(event) => setShowRoster(event.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Mostrar integrantes
          </label>
        )}
      </div>
      <motion.div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      >
        {participants.data.map((registration) => (
          <motion.div
            key={registration.id}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="surface p-4 transition hover:border-white/15"
          >
            <div className="flex items-center gap-3">
              <TeamLogo src={registration.logo} name={registration.display_name} size={40} />
              <p className="min-w-0 truncate font-display text-lg font-semibold">{registration.display_name}</p>
            </div>
            {team && showRoster && (
              <ul className="mt-4 space-y-1.5 border-t border-white/[0.05] pt-3 text-sm text-ink-300">
                {registration.members.map((member) => (
                  <li key={member.nickname} className="flex items-center gap-2">
                    {member.is_captain ? (
                      <Crown size={14} weight="fill" className="text-warn" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    {member.nickname}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

// -------------------------------------------------------------- stages

function Stages({ tournament }: { tournament: Tournament }) {
  const stages = useStages(tournament.id)
  if (stages.isPending) return <Skeleton className="h-80" />
  if (!stages.data?.length) {
    return (
      <EmptyState
        icon={<TreeStructure size={24} />}
        title="Las llaves aún no están definidas"
        description="Cuando se realice el sorteo verás aquí los grupos y el bracket."
      />
    )
  }
  return (
    <div className="space-y-16">
      {stages.data.map((stage) => (
        <StageView key={stage.id} stage={stage} />
      ))}
    </div>
  )
}

function StageView({ stage }: { stage: Stage }) {
  const bracket = useBracket(stage.id)
  const grouped = stage.stage_type === 'round_robin' || stage.stage_type === 'free_for_all'
  const standings = useStandings(grouped ? stage.id : 0)
  const empty = bracket.data && bracket.data.length === 0

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{stageTypeLabel[stage.stage_type]}</p>
          <h2 className="font-display text-3xl font-semibold">{stage.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={stage.status === 'ongoing' ? 'live' : stage.status === 'completed' ? 'win' : 'neutral'}>
            {stageStatusLabel[stage.status]}
          </Badge>
          <span className="text-sm text-ink-400">{stageDetails(stage)}</span>
        </div>
      </div>
      {bracket.isPending ? (
        <Skeleton className="h-64" />
      ) : empty ? (
        <p className="text-sm text-ink-400">El sorteo de esta fase todavía no se realiza.</p>
      ) : grouped ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {(standings.data ?? []).map((group) => (
            <div
              key={group.group_id ?? 'all'}
              className={
                (standings.data?.length ?? 0) <= 1
                  ? 'grid gap-6 lg:col-span-2 lg:grid-cols-2 lg:items-start'
                  : 'space-y-4'
              }
            >
              <GroupTable
                group={group}
                advance={stage.advance_per_group}
                lowerAdvance={stage.lower_advance_per_group}
                freeForAll={stage.stage_type === 'free_for_all'} />
              <GroupMatches
                matches={
                  bracket.data
                    ?.find((section) => section.group === group.group)
                    ?.rounds.flatMap((round) => round.matches) ?? []
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <BracketSections sections={bracket.data ?? []} />
      )}
    </section>
  )
}

// ------------------------------------------------------------ schedule

function Schedule({ tournament }: { tournament: Tournament }) {
  const schedule = useSchedule(tournament.id)
  if (schedule.isPending) return <Skeleton className="h-80" />
  if (!schedule.data?.length) {
    return (
      <EmptyState
        icon={<ListNumbers size={24} />}
        title="Cronograma por publicar"
        description="Las fechas y horas de cada match aparecerán aquí."
      />
    )
  }
  return (
    <div className="space-y-10">
      {groupByDay(schedule.data).map(([day, matches]) => (
        <section key={day}>
          <h3 className="mb-3 font-display text-lg font-semibold text-ink-300 first-letter:uppercase">
            {day === 'none' ? 'Sin fecha asignada' : formatDay(matches[0].scheduled_at!)}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ------------------------------------------------------------- streams

function GameStreams({ gameId }: { gameId: number }) {
  const streams = useStreams({ game: gameId })
  const [active, setActive] = useState<number | null>(null)
  if (streams.isPending) return <Skeleton className="aspect-video" />
  if (!streams.data?.length) {
    return (
      <EmptyState
        icon={<Broadcast size={24} />}
        title="Sin transmisiones por ahora"
        description="Cuando haya un match en vivo, la transmisión aparecerá aquí."
      />
    )
  }
  const current = streams.data.find((s) => s.id === active) ?? streams.data[0]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div>
        <StreamEmbed stream={current} />
        <div className="mt-4 flex items-center gap-3">
          {current.is_live && <Badge tone="live">En vivo</Badge>}
          <h2 className="font-display text-xl font-semibold">{current.title}</h2>
        </div>
      </div>
      <div className="space-y-2">
        {streams.data.map((stream) => (
          <button
            key={stream.id}
            onClick={() => setActive(stream.id)}
            className={cx(
              'surface flex w-full items-center justify-between gap-3 p-4 text-left transition hover:border-white/15',
              stream.id === current.id && 'border-accent/40',
            )}
          >
            <span className="min-w-0 truncate text-sm font-medium">{stream.title}</span>
            {stream.is_live ? <Badge tone="live">Vivo</Badge> : <Badge>{stream.platform}</Badge>}
          </button>
        ))}
      </div>
    </div>
  )
}
