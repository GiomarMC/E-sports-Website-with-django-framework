import {
  ArrowRight,
  Broadcast,
  CalendarCheck,
  ClipboardText,
  GameController,
  Trophy,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { roundLabel } from '../../lib/tournament'
import { Badge, Button, EmptyState, Skeleton } from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { formatDate, formatTime, tournamentStatusLabel } from '../../lib/format'
import { useMatches, useRegistrations, useStreams, useTournaments } from '../../lib/queries'

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function Dashboard() {
  const { user, canManage } = useAuth()
  const pending = useRegistrations({ status: 'pending' })
  const today = useMatches(todayRange())
  const live = useStreams({ live: true })
  const tournaments = useTournaments()
  const mine = (tournaments.data ?? []).filter((t) => canManage(t.game) && t.status !== 'completed' && t.status !== 'canceled')
  const myToday = (today.data ?? []).filter((m) => canManage(m.game))

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.first_name || user?.username}`}
        description="Esto es lo que necesita tu atención hoy."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          to="/admin/inscripciones"
          icon={<ClipboardText size={22} />}
          label="Inscripciones por revisar"
          value={pending.data?.length}
          highlight={(pending.data?.length ?? 0) > 0}
          cta="Revisar"
        />
        <Stat to="/admin/torneos" icon={<CalendarCheck size={22} />} label="Matchs hoy" value={myToday.length} cta="Ver matchs" />
        <Stat to="/admin/streams" icon={<Broadcast size={22} />} label="Streams en vivo" value={live.data?.length} cta="Gestionar" />
        <Stat to="/admin/torneos" icon={<Trophy size={22} />} label="Torneos activos" value={mine.length} cta="Gestionar" />
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.2fr_1fr]">
        <section>
          <h2 className="mb-4 font-display text-xl font-semibold">Tus torneos</h2>
          {tournaments.isPending ? (
            <Skeleton className="h-40" />
          ) : mine.length === 0 ? (
            <EmptyState
              icon={<GameController size={24} />}
              title="No tienes torneos activos"
              description="Crea un torneo para uno de tus juegos y abre las inscripciones."
              action={
                <Link to="/admin/torneos">
                  <Button>Crear torneo</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {mine.map((tournament, index) => (
                <motion.div
                  key={tournament.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link
                    to={`/admin/torneos/${tournament.id}`}
                    className="surface group flex items-center gap-4 p-4 transition hover:border-white/15"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink-400">{tournament.game_name}</p>
                      <p className="truncate font-display text-lg font-semibold">{tournament.name}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        {tournament.registration.registered} inscritos · inicia {formatDate(tournament.start_date)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={tournament.status === 'ongoing' ? 'live' : 'neutral'}>
                        {tournamentStatusLabel[tournament.status]}
                      </Badge>
                      <Badge tone={tournament.registration.is_open ? 'win' : 'neutral'}>
                        {tournament.registration.is_open ? 'Inscripción abierta' : 'Inscripción cerrada'}
                      </Badge>
                    </div>
                    <ArrowRight size={18} className="text-ink-400 transition group-hover:translate-x-1 group-hover:text-ink-100" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 font-display text-xl font-semibold">Matchs de hoy</h2>
          {today.isPending ? (
            <Skeleton className="h-40" />
          ) : myToday.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={24} />} title="Sin matchs hoy" />
          ) : (
            <div className="surface divide-y divide-white/[0.05]">
              {myToday.map((match) => (
                <Link
                  key={match.id}
                  to={`/admin/torneos/${match.tournament}?fase=${match.stage}`}
                  className="flex items-center gap-4 px-4 py-3 transition hover:bg-white/[0.02]"
                >
                  <span className="w-14 font-mono text-sm text-ink-300">
                    {formatTime(match.scheduled_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {match.participants.map((p) => p.registration_name ?? 'Por definir').join(' vs ')}
                  </span>
                  <span className="hidden text-xs text-ink-400 sm:block">{roundLabel(match.label, match.round)}</span>
                  {match.status === 'completed' ? <Badge tone="win">Listo</Badge> : <Badge tone="warn">Falta ganador</Badge>}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Stat({
  to,
  icon,
  label,
  value,
  cta,
  highlight,
}: {
  to: string
  icon: ReactNode
  label: string
  value?: number
  cta: string
  highlight?: boolean
}) {
  return (
    <Link
      to={to}
      className={`surface group flex flex-col gap-4 p-5 transition hover:border-white/15 ${highlight ? 'border-accent/40' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid size-10 place-items-center rounded-xl ${highlight ? 'bg-accent text-accent-ink' : 'bg-ink-800 text-ink-300'}`}>
          {icon}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-ink-400 transition group-hover:text-ink-100">
          {cta} <ArrowRight size={12} />
        </span>
      </div>
      <div>
        {value === undefined ? (
          <Skeleton className="h-9 w-12" />
        ) : (
          <p className="font-mono text-3xl font-semibold tabular-nums">{value}</p>
        )}
        <p className="mt-1 text-sm text-ink-400">{label}</p>
      </div>
    </Link>
  )
}
