import { ArrowRight, Broadcast, CalendarBlank, GameController, Timer, UsersThree } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { CountdownText } from '../../components/countdown'
import { MatchCard, StreamEmbed } from '../../components/tournament'
import { Badge, Button, cx, EmptyState, ErrorState, SectionTitle, Skeleton } from '../../components/ui'
import { tournamentMilestone, type Milestone } from '../../lib/countdown'
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
          <GamePanels games={games.data} tournaments={tournaments.data ?? []} />
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
        <Registrations settings={settings} games={games.data ?? []} tournaments={tournaments.data ?? []} />
        <LiveNow />
        <UpcomingMatches games={games.data ?? []} />
      </div>
    </>
  )
}

function GamePanels({ games, tournaments }: { games: Game[]; tournaments: Tournament[] }) {
  return (
    <div className="group/panels scrollbar-thin flex h-[min(78dvh,760px)] snap-x snap-mandatory overflow-x-auto md:overflow-hidden">
      {games.map((game, index) => {
        const tournament = currentTournament(tournaments, game.id)
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

/** The registration of every game in one place: its own countdown (each
 * tournament has its own dates), price and the button to sign up. The game
 * images already are in the panels above, so the rows go without them. */
function Registrations({
  settings,
  games,
  tournaments,
}: {
  settings?: SiteSettings
  games: Game[]
  tournaments: Tournament[]
}) {
  const now = useNow(30000)
  const rows = games
    .map((game) => ({ game, tournament: currentTournament(tournaments, game.id) }))
    .filter((row): row is { game: Game; tournament: Tournament } => !!row.tournament)
  if (rows.length === 0) return null
  const anyOpen = rows.some((row) => row.tournament.registration.is_open)

  return (
    <section>
      <SectionTitle
        eyebrow="Inscripciones"
        title={anyOpen ? 'Arma tu equipo y entra a competir' : 'Fechas de cada juego'}
      />
      <div className="surface divide-y divide-white/[0.05]">
        {rows.map(({ game, tournament }, index) => {
          const milestone = tournamentMilestone(tournament, now, settings)
          const open = tournament.registration.is_open
          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: index * 0.05, type: 'spring', stiffness: 140, damping: 22 }}
              className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-6"
            >
              <div className="min-w-0">
                <Link to={`/juegos/${game.id}`} className="font-display text-xl font-semibold hover:text-accent">
                  {game.name}
                </Link>
                <p className="mt-0.5 truncate text-sm text-ink-400">
                  {formatMoney(tournament.fee_per_player, tournament.currency)} por jugador ·{' '}
                  {playersLabel(tournament.min_players, tournament.max_players)}
                </p>
              </div>
              <div className="min-w-0">
                <p
                  className={cx(
                    'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]',
                    milestone ? KIND_TONE[milestone.kind] : 'text-ink-400',
                  )}
                >
                  <Timer size={13} weight="bold" />
                  {milestone
                    ? milestone.label
                    : tournament.status === 'ongoing'
                      ? 'Torneo en curso'
                      : tournament.status === 'completed'
                        ? 'Torneo finalizado'
                        : tournament.registration.reason}
                </p>
                {milestone && (
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                    <CountdownText key={milestone.target} target={milestone.target} className="text-2xl font-semibold text-ink-100" />
                    <span className="text-xs text-ink-400 first-letter:uppercase">
                      {formatDay(milestone.target)} · {formatTime(milestone.target)}
                    </span>
                  </p>
                )}
              </div>
              {open ? (
                <Link to={`/torneos/${tournament.id}/inscripcion`}>
                  <Button icon={<ArrowRight size={16} />} className="w-full flex-row-reverse sm:w-auto">
                    Inscribirse
                  </Button>
                </Link>
              ) : (
                <Link to={`/juegos/${game.id}`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Ver torneo
                  </Button>
                </Link>
              )}
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
