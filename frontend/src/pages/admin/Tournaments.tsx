import { ArrowRight, PencilSimple, Plus, Trophy } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  Toggle,
} from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { api } from '../../lib/api'
import { formatDate, formatMoney, fromInputDateTime, toInputDateTime, tournamentStatusLabel } from '../../lib/format'
import { useApiMutation, useGames, useTournaments } from '../../lib/queries'
import type { Tournament, TournamentStatus } from '../../lib/types'

export default function TournamentsPage() {
  const { canManage } = useAuth()
  const tournaments = useTournaments()
  const [editing, setEditing] = useState<Tournament | 'new' | null>(null)
  const mine = (tournaments.data ?? []).filter((t) => canManage(t.game))

  return (
    <>
      <PageHeader
        title="Torneos y matchs"
        description="Crea el torneo de cada juego, abre o cierra inscripciones y entra a gestionar sus fases, sorteo y resultados."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Nuevo torneo
          </Button>
        }
      />
      {tournaments.isPending ? (
        <Skeleton className="h-60" />
      ) : tournaments.isError ? (
        <ErrorState message={tournaments.error.message} />
      ) : mine.length === 0 ? (
        <EmptyState
          icon={<Trophy size={24} />}
          title="Aún no hay torneos"
          description="Crea el primero para empezar a recibir inscripciones."
          action={<Button onClick={() => setEditing('new')}>Crear torneo</Button>}
        />
      ) : (
        <div className="grid gap-3">
          {mine.map((tournament) => (
            <div key={tournament.id} className="surface grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">{tournament.game_name}</span>
                  <Badge tone={tournament.status === 'ongoing' ? 'live' : tournament.status === 'completed' ? 'win' : 'neutral'}>
                    {tournamentStatusLabel[tournament.status]}
                  </Badge>
                </div>
                <p className="truncate font-display text-xl font-semibold">{tournament.name}</p>
                <p className="mt-1 text-sm text-ink-400">
                  Inicia {formatDate(tournament.start_date, true)} · {formatMoney(tournament.fee_per_player, tournament.currency)} por
                  jugador · {tournament.registration.registered} inscritos · {tournament.stages.length} fases
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <RegistrationSwitch tournament={tournament} />
                <Button variant="secondary" icon={<PencilSimple size={16} />} onClick={() => setEditing(tournament)}>
                  Editar
                </Button>
                <Link to={`/admin/torneos/${tournament.id}`}>
                  <Button icon={<ArrowRight size={16} />} className="flex-row-reverse">
                    Gestionar
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <TournamentForm tournament={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

export function RegistrationSwitch({ tournament }: { tournament: Tournament }) {
  const toggle = useApiMutation({
    request: (open: boolean) =>
      api(`tournaments/${tournament.id}/${open ? 'open' : 'close'}-registration/`, { method: 'POST' }),
    invalidate: [['tournaments'], ['tournament', tournament.id]],
    success: 'Inscripciones actualizadas',
  })
  return (
    <label className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
      <Toggle
        checked={tournament.registration_enabled}
        onChange={(value) => toggle.mutate(value)}
        disabled={toggle.isPending}
        label="Inscripciones"
      />
      <span>
        Inscripciones
        <span
          className={`block max-w-56 truncate text-xs ${tournament.registration.is_open ? 'text-win' : 'text-ink-400'}`}
          title={tournament.registration.reason}
        >
          {tournament.registration.is_open ? 'Abiertas ahora' : tournament.registration.reason}
        </span>
      </span>
    </label>
  )
}

export function TournamentForm({ tournament, onClose }: { tournament: Tournament | null; onClose: () => void }) {
  const { canManage } = useAuth()
  const navigate = useNavigate()
  const games = useGames()
  const managed = (games.data ?? []).filter((g) => canManage(g.id))
  const [form, setForm] = useState({
    game: tournament?.game ?? 0,
    name: tournament?.name ?? '',
    description: tournament?.description ?? '',
    start_date: toInputDateTime(tournament?.start_date),
    end_date: toInputDateTime(tournament?.end_date),
    fee_per_player: tournament?.fee_per_player ?? '5.00',
    max_registrations: tournament?.max_registrations?.toString() ?? '',
    registration_start: toInputDateTime(tournament?.registration_start),
    registration_end: toInputDateTime(tournament?.registration_end),
    status: (tournament?.status ?? 'upcoming') as TournamentStatus,
  })
  const set = (field: keyof typeof form, value: string | number) => setForm((f) => ({ ...f, [field]: value }))

  const save = useApiMutation({
    request: () => {
      const body = {
        ...(tournament ? {} : { game: form.game || managed[0]?.id }),
        name: form.name,
        description: form.description,
        start_date: fromInputDateTime(form.start_date),
        end_date: fromInputDateTime(form.end_date),
        fee_per_player: form.fee_per_player || '0',
        max_registrations: form.max_registrations ? Number(form.max_registrations) : null,
        registration_start: fromInputDateTime(form.registration_start),
        registration_end: fromInputDateTime(form.registration_end),
        ...(tournament ? { status: form.status } : {}),
      }
      return tournament
        ? api<Tournament>(`tournaments/${tournament.id}/`, { method: 'PATCH', body })
        : api<Tournament>('tournaments/', { method: 'POST', body })
    },
    invalidate: [['tournaments'], ['tournament'], ['games']],
    success: tournament ? 'Torneo actualizado' : 'Torneo creado',
    onSuccess: (result) => {
      onClose()
      if (!tournament) navigate(`/admin/torneos/${result.id}`)
    },
  })
  const errors = save.error?.fields ?? {}

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={tournament ? 'Editar torneo' : 'Nuevo torneo'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="tournament-form" loading={save.isPending}>
            {tournament ? 'Guardar cambios' : 'Crear torneo'}
          </Button>
        </>
      }
    >
      <form id="tournament-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        {!tournament && (
          <Field label="Juego" error={errors.game} className="sm:col-span-2">
            {(id) => (
              <Select id={id} value={form.game || managed[0]?.id || ''} onChange={(e) => set('game', Number(e.target.value))}>
                {managed.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Nombre" error={errors.name} className="sm:col-span-2">
          {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Copa Dota 2 2026" />}
        </Field>
        <Field label="Descripción (opcional)" error={errors.description} className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <Field label="Inicio del torneo" error={errors.start_date}>
          {(id) => <Input id={id} type="datetime-local" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />}
        </Field>
        <Field label="Fin (opcional)" error={errors.end_date}>
          {(id) => <Input id={id} type="datetime-local" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />}
        </Field>
        <Field label="Monto por jugador (S/)" error={errors.fee_per_player} hint="0 para un torneo gratuito.">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              step="0.50"
              value={form.fee_per_player}
              onChange={(e) => set('fee_per_player', e.target.value)}
            />
          )}
        </Field>
        <Field label="Cupos (opcional)" error={errors.max_registrations} hint="Máximo de equipos o jugadores.">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={form.max_registrations}
              onChange={(e) => set('max_registrations', e.target.value)}
            />
          )}
        </Field>
        <div className="rounded-xl border border-white/[0.06] p-4 sm:col-span-2">
          <p className="text-sm font-semibold">Fechas de inscripción</p>
          <p className="mb-4 text-xs text-ink-400">
            Sin inicio, abren de inmediato. Sin fin, siguen abiertas hasta que las cierres o el torneo pase a En curso.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Desde" error={errors.registration_start}>
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={form.registration_start}
                  onChange={(e) => set('registration_start', e.target.value)}
                />
              )}
            </Field>
            <Field label="Hasta" error={errors.registration_end}>
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={form.registration_end}
                  onChange={(e) => set('registration_end', e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
        {tournament && (
          <Field label="Estado" error={errors.status}>
            {(id) => (
              <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(tournamentStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {errors.detail && <p className="text-sm text-accent sm:col-span-2">{errors.detail}</p>}
      </form>
    </Modal>
  )
}
