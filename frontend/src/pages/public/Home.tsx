import { ArrowRight, Broadcast, CalendarBlank, GameController, Timer, UsersThree } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Countdown, CountdownText } from '../../components/countdown'
import { MatchCard, StreamEmbed } from '../../components/tournament'
import { Badge, Button, cx, EmptyState, ErrorState, SectionTitle, Skeleton } from '../../components/ui'
import { generalMilestone, tournamentMilestone, type Milestone } from '../../lib/countdown'
import { formatDate, formatDay, formatMoney, formatTime, playersLabel } from '../../lib/format'
import { useGames, useMatches, useSettings, useStreams, useTournaments } from '../../lib/queries'
import { currentTournament } from '../../lib/tournament'
import type { Game, SiteSettings, Tournament } from '../../lib/types'
import { useNow } from '../../lib/useNow'

const SEASON = new Date().getFullYear()

export default function Home() {
  const games = useGames()
  const tournaments = useTournaments()
  const { data: settings } = useSettings()

  return (
    <>
      <section aria-label="Juegos" className="relative">
        {games.isPending ? (
          <div className="grid h-[min(78dvh,760px)] grid-cols-1 gap-1 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-full rounded-none" />
            ))}
          </div>
        ) : games.isError ? (
          <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8">
            <ErrorState message={games.error.message} onRetry={() => games.refetch()} />
          </div>
        ) : games.data.length === 0 ? (
          <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8">
            <EmptyState
              icon={<GameController size={24} />}
              title="Aún no hay juegos publicados"
              description="Los administradores están preparando los torneos. Vuelve pronto."
            />
          </div>
        ) : (
          <GamePanels games={games.data} tournaments={tournaments.data ?? []} settings={settings} />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden md:block">
          <div className="mx-auto max-w-[1400px] px-8 pt-10">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-ink-100/80"
            >
              {settings?.event_name ?? 'Esports'} · Temporada {SEASON}
            </motion.p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] space-y-24 px-4 pt-16 md:px-8">
        <EventCountdown settings={settings} games={games.data ?? []} tournaments={tournaments.data ?? []} />
        <OpenRegistrations tournaments={tournaments.data ?? []} games={games.data ?? []} />
        <LiveNow />
        <UpcomingMatches games={games.data ?? []} />
      </div>
    </>
  )
}

function GamePanels({
  games,
  tournaments,
  settings,
}: {
  games: Game[]
  tournaments: Tournament[]
  settings?: SiteSettings
}) {
  const now = useNow(30000)
  return (
    <div className="group/panels scrollbar-thin flex h-[min(78dvh,760px)] snap-x snap-mandatory overflow-x-auto md:overflow-hidden">
      {games.map((game, index) => {
        const tournament = currentTournament(tournaments, game.id)
        const milestone = tournament && tournamentMilestone(tournament, now, settings)
        return (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, type: 'spring', stiffness: 120, damping: 20 }}
            className="relative min-w-[82%] flex-1 snap-start transition-[flex-grow] duration-700 ease-out-expo sm:min-w-[45%] md:min-w-0 md:hover:flex-[1.6]"
          >
            <Link
              to={`/juegos/${game.id}`}
              className="group/panel absolute inset-0 block overflow-hidden border-r border-ink-950 transition duration-500 md:group-hover/panels:brightness-[0.55] md:hover:!brightness-100"
            >
              {game.images ? (
                <img
                  src={game.images}
                  alt=""
                  className="absolute inset-0 size-full object-cover transition duration-700 ease-out-expo group-hover/panel:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--color-ink-700),var(--color-ink-900))]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
                <div className="mb-4 flex flex-wrap gap-2">
                  {tournament?.registration.is_open && <Badge tone="win">Inscripciones abiertas</Badge>}
                  {tournament?.status === 'ongoing' && <Badge tone="live">En curso</Badge>}
                  <Badge>{game.type_of_game === 'team' ? 'Equipos' : 'Individual'}</Badge>
                </div>
                <h2 className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight md:text-5xl xl:text-6xl">
                  {game.name}
                </h2>
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
                  <UsersThree size={16} /> {playersLabel(game.min_players, game.max_players)}
                  {tournament && (
                    <>
                      <span className="text-ink-600">/</span>
                      <CalendarBlank size={16} /> {formatDate(tournament.start_date)}
                    </>
                  )}
                </p>
                {milestone && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-xs text-ink-300 backdrop-blur">
                    <Timer size={14} className={milestone.kind === 'closes' ? 'text-warn' : 'text-ink-300'} />
                    {milestone.label}
                    <CountdownText target={milestone.target} className="font-semibold text-ink-100" />
                  </p>
                )}
                <span className="mt-6 inline-flex translate-y-2 items-center gap-2 text-sm font-semibold text-ink-100 opacity-0 transition duration-500 group-hover/panel:translate-y-0 group-hover/panel:opacity-100">
                  Ver torneo <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

const KIND_TONE: Record<Milestone['kind'], string> = {
  opens: 'text-ink-100',
  closes: 'text-warn',
  starts: 'text-win',
}

/** General countdown (settings) next to one countdown per game, because a
 * game can extend its registration while another one already closed it. */
function EventCountdown({
  settings,
  games,
  tournaments,
}: {
  settings?: SiteSettings
  games: Game[]
  tournaments: Tournament[]
}) {
  const now = useNow(30000)
  const general = generalMilestone(settings, tournaments, now)
  const rows = games
    .map((game) => {
      const tournament = currentTournament(tournaments, game.id)
      return { game, tournament, milestone: tournament ? tournamentMilestone(tournament, now, settings) : null }
    })
    .filter((row) => row.tournament)
  if (!general && rows.every((row) => !row.milestone)) return null

  return (
    <section className="surface grid overflow-hidden lg:grid-cols-[1.15fr_1fr]">
      <div className="relative flex flex-col justify-center gap-6 border-b border-white/[0.06] p-6 sm:p-10 lg:border-r lg:border-b-0">
        <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            {settings?.event_name ?? 'Esports'} · Cuenta regresiva
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {general ? general.label : 'Sigue cada juego'}
          </h2>
        </div>
        {general ? (
          <div className="relative">
            <Countdown key={general.target} target={general.target} />
            <p className="mt-4 text-sm text-ink-400 first-letter:uppercase">
              {formatDay(general.target)} · {formatTime(general.target)}
            </p>
          </div>
        ) : (
          <p className="relative max-w-[48ch] text-sm leading-relaxed text-ink-400">
            Las inscripciones generales ya cerraron. Cada juego puede tener sus propias fechas: revisa su contador.
          </p>
        )}
      </div>
      <div className="p-2 sm:p-3">
        <p className="px-3 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Por juego</p>
        <ul className="divide-y divide-white/[0.05]">
          {rows.map(({ game, tournament, milestone }) => (
            <li key={game.id}>
              <Link
                to={`/juegos/${game.id}`}
                className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.03]"
              >
                <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                  {game.images && <img src={game.images} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-semibold">{game.name}</p>
                  <p className="truncate text-xs text-ink-400">
                    {milestone
                      ? milestone.label
                      : tournament!.status === 'ongoing'
                        ? 'Torneo en curso'
                        : tournament!.status === 'completed'
                          ? 'Torneo finalizado'
                          : tournament!.registration.reason}
                  </p>
                </div>
                {milestone ? (
                  <CountdownText
                    key={milestone.target}
                    target={milestone.target}
                    className={cx('text-sm font-semibold', KIND_TONE[milestone.kind])}
                  />
                ) : tournament!.status === 'ongoing' ? (
                  <Badge tone="live">En curso</Badge>
                ) : null}
                <ArrowRight size={14} className="shrink-0 text-ink-600 transition group-hover:text-ink-300" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function OpenRegistrations({ tournaments, games }: { tournaments: Tournament[]; games: Game[] }) {
  const open = tournaments.filter((t) => t.registration.is_open)
  if (open.length === 0) return null
  return (
    <section>
      <SectionTitle eyebrow="Inscripciones" title="Arma tu equipo y entra a competir" />
      <div className="grid gap-4 lg:grid-cols-2">
        {open.map((tournament, index) => {
          const game = games.find((g) => g.id === tournament.game)
          return (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: index * 0.06, type: 'spring', stiffness: 120, damping: 20 }}
              className="surface grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center"
            >
              <div className="size-16 overflow-hidden rounded-xl bg-ink-800">
                {game?.images && <img src={game.images} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{tournament.game_name}</p>
                <p className="truncate font-display text-xl font-semibold">{tournament.name}</p>
                <p className="mt-1 text-sm text-ink-400">
                  {formatMoney(tournament.fee_per_player, tournament.currency)} por jugador ·{' '}
                  {playersLabel(tournament.min_players, tournament.max_players)}
                  {tournament.registration.ends_at && (
                    <>
                      {' '}
                      · Cierra en <CountdownText target={tournament.registration.ends_at} className="text-warn" />
                    </>
                  )}
                </p>
              </div>
              <Link to={`/torneos/${tournament.id}/inscripcion`}>
                <Button size="lg" icon={<ArrowRight size={18} />} className="w-full flex-row-reverse sm:w-auto">
                  Inscribirse
                </Button>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

function LiveNow() {
  const { data: streams } = useStreams({ live: true })
  const main = streams?.[0]
  if (!main) return null
  return (
    <section>
      <SectionTitle
        eyebrow="En vivo"
        title={main.title}
        action={
          <Link to="/en-vivo" className="inline-flex items-center gap-2 text-sm font-medium text-ink-300 hover:text-ink-100">
            <Broadcast size={16} /> Todas las transmisiones
          </Link>
        }
      />
      <StreamEmbed stream={main} />
    </section>
  )
}

function UpcomingMatches({ games }: { games: Game[] }) {
  const matches = useMatches({ upcoming: true })
  const list = (matches.data ?? []).slice(0, 6)
  return (
    <section>
      <SectionTitle
        eyebrow="Cronograma"
        title="Próximos matchs"
        action={
          <Link to="/cronograma" className="inline-flex items-center gap-2 text-sm font-medium text-ink-300 hover:text-ink-100">
            Ver cronograma <ArrowRight size={16} />
          </Link>
        }
      />
      {matches.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<CalendarBlank size={24} />}
          title="Sin matchs programados"
          description="Cuando se publique el cronograma verás aquí los próximos enfrentamientos."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((match) => (
            <MatchCard key={match.id} match={match} gameName={games.find((g) => g.id === match.game)?.name} />
          ))}
        </div>
      )}
    </section>
  )
}
