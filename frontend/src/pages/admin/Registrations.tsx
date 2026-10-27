import {
  CheckCircle,
  ClipboardText,
  Crown,
  Eye,
  EyeSlash,
  FilePdf,
  ImageSquare,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  Wallet,
  XCircle,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  cx,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  TeamLogo,
} from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { PageHeader } from '../../layouts/AdminLayout'
import { api, toFormData } from '../../lib/api'
import { formatDate, formatMoney, registrationStatusLabel } from '../../lib/format'
import { useApiMutation, useGames, useRegistrations, useTournament, useTournaments } from '../../lib/queries'
import { PaymentMethodsPanel } from './PaymentMethods'
import type { Member, Registration, RegistrationStatus, Tournament } from '../../lib/types'

export default function RegistrationsPage() {
  const [tab, setTab] = useState<'inscripciones' | 'pagos'>('inscripciones')
  return (
    <>
      <PageHeader
        title="Inscripciones"
        description="Revisa el comprobante de pago de cada inscripción y confírmala o recházala. También puedes corregir sus datos, logo e integrantes."
      />
      <div className="mb-6">
        <Tabs
          layoutId="registrations-tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'inscripciones', label: 'Inscripciones', icon: <ClipboardText size={16} /> },
            { value: 'pagos', label: 'Métodos de pago', icon: <Wallet size={16} /> },
          ]}
        />
      </div>
      {tab === 'inscripciones' ? <RegistrationsPanel /> : <PaymentsByGame />}
    </>
  )
}

/** Payment methods of the games the admin manages (one game at a time). */
function PaymentsByGame() {
  const { canManage } = useAuth()
  const games = useGames()
  const managed = (games.data ?? []).filter((g) => canManage(g.id))
  const [selected, setSelected] = useState<number | null>(null)
  const game = managed.find((g) => g.id === selected) ?? managed[0]
  if (games.isPending) return <Skeleton className="h-48" />
  if (!game) {
    return <EmptyState icon={<Wallet size={24} />} title="Sin juegos asignados" description="Pide a un superadmin que te asigne un juego." />
  }
  return (
    <div className="space-y-6">
      {managed.length > 1 && (
        <Select value={game.id} onChange={(e) => setSelected(Number(e.target.value))} className="max-w-xs" aria-label="Juego">
          {managed.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      )}
      <PaymentMethodsPanel key={game.id} gameId={game.id} gameName={game.name} paid={false} />
    </div>
  )
}

const statusTone = { pending: 'warn', confirmed: 'win', rejected: 'accent' } as const

export function RegistrationsPanel({ tournamentId }: { tournamentId?: number }) {
  const tournaments = useTournaments()
  const [status, setStatus] = useState<RegistrationStatus | ''>('pending')
  const [tournament, setTournament] = useState<number | ''>(tournamentId ?? '')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const registrations = useRegistrations({
    status: status || undefined,
    tournament: tournamentId ?? (tournament || undefined),
    search: search.trim() || undefined,
  })
  const selected = registrations.data?.find((r) => r.id === openId) ?? null

  return (
    <div>
      <div className="mb-6 grid gap-3 md:grid-cols-[auto_1fr_1fr]">
        <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-ink-900 p-1">
          {(['pending', 'confirmed', 'rejected', ''] as const).map((value) => (
            <button
              key={value || 'all'}
              onClick={() => setStatus(value)}
              className={cx(
                'h-9 rounded-lg px-3 text-sm font-medium transition',
                status === value ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100',
              )}
            >
              {value ? registrationStatusLabel[value] + 's' : 'Todas'}
            </button>
          ))}
        </div>
        {!tournamentId && (
          <Select value={tournament} onChange={(e) => setTournament(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos los torneos</option>
            {(tournaments.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.game_name} · {t.name}
              </option>
            ))}
          </Select>
        )}
        <div className={cx('relative', !!tournamentId && 'md:col-span-2')}>
          <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar equipo, nick o código"
            className="pl-10"
          />
        </div>
      </div>

      {registrations.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : registrations.isError ? (
        <ErrorState message={registrations.error.message} onRetry={() => registrations.refetch()} />
      ) : registrations.data.length === 0 ? (
        <EmptyState
          icon={<ClipboardText size={24} />}
          title={status === 'pending' ? 'Nada por revisar' : 'Sin inscripciones'}
          description={status === 'pending' ? 'Todas las inscripciones están revisadas.' : 'Prueba con otros filtros.'}
        />
      ) : (
        <div className="surface divide-y divide-white/[0.05] overflow-hidden">
          {registrations.data.map((registration) => (
            <button
              key={registration.id}
              onClick={() => setOpenId(registration.id)}
              className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-white/[0.02] sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TeamLogo src={registration.logo} name={registration.display_name} size={40} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {registration.display_name}
                    {!registration.is_active && <span className="ml-2 text-xs text-ink-400">(deshabilitado)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {registration.tournament_name} · {registration.members.length} jugadores · {formatDate(registration.created_at, true)}
                  </p>
                </div>
              </div>
              <span className="font-mono text-sm">{formatMoney(registration.amount_due)}</span>
              <Badge tone={statusTone[registration.status]}>{registrationStatusLabel[registration.status]}</Badge>
            </button>
          ))}
        </div>
      )}

      <RegistrationDetail key={selected?.id ?? 0} registration={selected} onClose={() => setOpenId(null)} />
    </div>
  )
}

function RegistrationDetail({ registration, onClose }: { registration: Registration | null; onClose: () => void }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [seed, setSeed] = useState('')
  const [editingTeam, setEditingTeam] = useState(false)
  // ``null``: new player; ``undefined``: dialog closed.
  const [editingMember, setEditingMember] = useState<Member | null | undefined>(undefined)
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const tournament = useTournament(registration?.tournament ?? 0).data
  const invalidate = [['registrations'], ['tournament'], ['tournaments']]

  const confirm = useApiMutation({
    request: (id: number) => api(`registrations/${id}/confirm/`, { method: 'POST' }),
    invalidate,
    success: 'Inscripción confirmada',
  })
  const reject = useApiMutation({
    request: (id: number) => api(`registrations/${id}/reject/`, { method: 'POST', body: { reason } }),
    invalidate,
    success: 'Inscripción rechazada',
    onSuccess: () => {
      setRejecting(false)
      setReason('')
    },
  })
  const toggle = useApiMutation({
    request: (r: Registration) => api(`registrations/${r.id}/${r.is_active ? 'disable' : 'enable'}/`, { method: 'POST' }),
    invalidate,
    success: 'Actualizado',
  })
  const saveSeed = useApiMutation({
    request: (r: Registration) =>
      api(`registrations/${r.id}/`, { method: 'PATCH', body: { seed: seed === '' ? null : Number(seed) } }),
    invalidate,
    success: 'Seed guardado',
  })
  const removeMember = useApiMutation({
    request: (member: Member) => api(`registrations/${registration!.id}/members/${member.id}/`, { method: 'DELETE' }),
    invalidate,
    success: 'Jugador quitado',
    onSuccess: () => setRemovingMember(null),
  })
  const remove = useApiMutation({
    request: (id: number) => api(`registrations/${id}/`, { method: 'DELETE' }),
    invalidate,
    success: 'Inscripción eliminada',
    onSuccess: () => {
      setDeleting(false)
      onClose()
    },
  })

  if (!registration) return <Modal open={false} onClose={onClose} title="">{null}</Modal>

  const voucherIsPdf = registration.voucher_is_pdf
  const players = registration.members.length
  const team = tournament?.type_of_game === 'team'

  return (
    <>
      <Modal
        open
        wide
        onClose={onClose}
        title={registration.display_name}
        description={`${registration.tournament_name} · enviada el ${formatDate(registration.created_at, true)}`}
        footer={
          registration.status === 'pending' ? (
            <>
              <Button variant="danger" size="lg" icon={<XCircle size={18} />} onClick={() => setRejecting(true)}>
                Rechazar
              </Button>
              <Button
                variant="success"
                size="lg"
                icon={<CheckCircle size={18} />}
                loading={confirm.isPending}
                onClick={() => confirm.mutate(registration.id)}
              >
                Confirmar inscripción
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" icon={<Trash size={16} />} onClick={() => setDeleting(true)}>
                Eliminar
              </Button>
              {registration.status === 'rejected' ? (
                <Button variant="success" icon={<CheckCircle size={16} />} onClick={() => confirm.mutate(registration.id)}>
                  Confirmar de todos modos
                </Button>
              ) : (
                <Button variant="danger" icon={<XCircle size={16} />} onClick={() => setRejecting(true)}>
                  Rechazar
                </Button>
              )}
            </>
          )
        }
      >
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone[registration.status]}>{registrationStatusLabel[registration.status]}</Badge>
              {registration.reviewed_by && (
                <span className="text-xs text-ink-400">
                  por {registration.reviewed_by} · {formatDate(registration.reviewed_at, true)}
                </span>
              )}
            </div>
            {registration.rejection_reason && (
              <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">Motivo: {registration.rejection_reason}</p>
            )}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-300">Integrantes</h3>
                {tournament && players < tournament.max_players && (
                  <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setEditingMember(null)}>
                    Agregar jugador
                  </Button>
                )}
              </div>
              <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full min-w-[580px] text-sm">
                  <thead className="bg-ink-850 text-left text-xs text-ink-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nick</th>
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">ID cuenta</th>
                      <th className="px-3 py-2">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {registration.members.map((member) => (
                      <tr key={member.id}>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            {member.is_captain && <Crown size={12} weight="fill" className="text-warn" />}
                            {member.nickname}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-ink-300">
                          {member.full_name}
                          {member.is_external && (
                            <span className="mt-0.5 block text-xs text-warn">Otra universidad: {member.university}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-ink-300">{member.student_code}</td>
                        <td className="px-3 py-2 text-ink-400">{member.game_account_id || '-'}</td>
                        <td className="px-2 py-2">
                          <span className="flex justify-end gap-1">
                            <button
                              onClick={() => setEditingMember(member)}
                              className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-white/5 hover:text-ink-100"
                              aria-label={`Editar a ${member.nickname}`}
                            >
                              <PencilSimple size={16} />
                            </button>
                            {tournament && players > tournament.min_players && !(team && member.is_captain) && (
                              <button
                                onClick={() => setRemovingMember(member)}
                                className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-accent-soft hover:text-accent"
                                aria-label={`Quitar a ${member.nickname}`}
                              >
                                <Trash size={16} />
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {editingTeam ? (
              <TeamDataForm registration={registration} team={team} onDone={() => setEditingTeam(false)} />
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink-300">{team ? 'Datos del equipo' : 'Contacto'}</h3>
                  <Button variant="ghost" size="sm" icon={<PencilSimple size={14} />} onClick={() => setEditingTeam(true)}>
                    Editar
                  </Button>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-400">Correo</dt>
                    <dd className="break-all">{registration.contact_email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Celular</dt>
                    <dd>{registration.contact_phone || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Código</dt>
                    <dd className="truncate font-mono text-xs">{registration.code}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-ink-850 p-4">
              <p className="text-xs text-ink-400">Monto a pagar</p>
              <p className="font-mono text-2xl font-semibold">{formatMoney(registration.amount_due)}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-300">Comprobante</p>
              {!registration.voucher ? (
                <p className="text-sm text-ink-400">Sin comprobante (torneo gratuito).</p>
              ) : voucherIsPdf ? (
                <a href={registration.voucher} target="_blank" rel="noreferrer">
                  <Button variant="secondary" className="w-full" icon={<FilePdf size={16} />}>
                    Abrir PDF
                  </Button>
                </a>
              ) : (
                <a href={registration.voucher} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/[0.06]">
                  <img src={registration.voucher} alt="Comprobante de pago" className="max-h-72 w-full object-contain bg-ink-950" />
                </a>
              )}
            </div>
            <div className="space-y-3 rounded-xl border border-white/[0.06] p-4">
              <Field label="Seed (orden)" hint="Opcional. Ordena a los equipos al hacer el sorteo sin aleatorio.">
                {(id) => (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      value={seed === '' ? (registration.seed ?? '') : seed}
                      onChange={(e) => setSeed(e.target.value)}
                    />
                    <Button variant="secondary" loading={saveSeed.isPending} onClick={() => saveSeed.mutate(registration)}>
                      Guardar
                    </Button>
                  </div>
                )}
              </Field>
              <Button
                variant="secondary"
                className="w-full"
                icon={registration.is_active ? <EyeSlash size={16} /> : <Eye size={16} />}
                loading={toggle.isPending}
                onClick={() => toggle.mutate(registration)}
              >
                {registration.is_active ? 'Deshabilitar equipo' : 'Habilitar equipo'}
              </Button>
              <p className="text-xs text-ink-400">Un equipo deshabilitado no entra al sorteo ni aparece en la lista pública.</p>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={rejecting}
        title="Rechazar inscripción"
        description="El equipo podrá ver el motivo al consultar su código y sus jugadores podrán volver a inscribirse."
        confirmLabel="Rechazar"
        tone="danger"
        loading={reject.isPending}
        onConfirm={() => reject.mutate(registration.id)}
        onClose={() => setRejecting(false)}
      >
        <div className="mt-4">
          <Field label="Motivo">
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="El comprobante no corresponde al monto"
              />
            )}
          </Field>
        </div>
      </ConfirmDialog>
      {editingMember !== undefined && tournament && (
        <MemberDialog
          registration={registration}
          tournament={tournament}
          member={editingMember}
          onClose={() => setEditingMember(undefined)}
        />
      )}
      <ConfirmDialog
        open={!!removingMember}
        title="Quitar jugador"
        description={`Se quitará a ${removingMember?.nickname ?? ''} del equipo y el monto a pagar se recalculará con los jugadores que queden.`}
        confirmLabel="Quitar"
        tone="danger"
        loading={removeMember.isPending}
        onConfirm={() => removingMember && removeMember.mutate(removingMember)}
        onClose={() => setRemovingMember(null)}
      />
      <ConfirmDialog
        open={deleting}
        title="Eliminar inscripción"
        description="Se borrará la inscripción y sus integrantes. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(registration.id)}
        onClose={() => setDeleting(false)}
      />
    </>
  )
}

/** Team name, logo and contact of a sent registration (for typos or a
 * forgotten logo). */
function TeamDataForm({ registration, team, onDone }: { registration: Registration; team: boolean; onDone: () => void }) {
  const [teamName, setTeamName] = useState(registration.team_name)
  const [email, setEmail] = useState(registration.contact_email)
  const [phone, setPhone] = useState(registration.contact_phone)
  const [logo, setLogo] = useState<File | null>(null)
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : registration.logo), [logo, registration.logo])
  const save = useApiMutation({
    request: () =>
      api(`registrations/${registration.id}/`, {
        method: 'PATCH',
        body: toFormData({
          team_name: team ? teamName : undefined,
          contact_email: email,
          contact_phone: phone,
          logo: logo ?? undefined,
        }),
      }),
    invalidate: [['registrations'], ['tournament'], ['tournaments']],
    success: 'Datos actualizados',
    onSuccess: onDone,
  })
  const errors = save.error?.fields ?? {}

  return (
    <form
      className="space-y-4 rounded-xl border border-white/[0.06] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {team && (
          <Field label="Nombre del equipo" error={errors.team_name}>
            {(id) => (
              <Input id={id} value={teamName} onChange={(e) => setTeamName(e.target.value)} invalid={!!errors.team_name} maxLength={100} />
            )}
          </Field>
        )}
        {team && (
          <Field label="Logo" error={errors.logo}>
            {(id) => (
              <label
                htmlFor={id}
                className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-3 text-sm text-ink-300 transition hover:border-accent/50"
              >
                {logoPreview ? <img src={logoPreview} alt="" className="size-7 rounded-md object-cover" /> : <ImageSquare size={20} />}
                {logoPreview ? 'Cambiar' : 'Subir imagen'}
                <input
                  id={id}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </Field>
        )}
        <Field label="Correo" error={errors.contact_email}>
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.contact_email} />}
        </Field>
        <Field label="Celular del capitán" error={errors.contact_phone}>
          {(id) => (
            <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.contact_phone} maxLength={20} />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

const emptyMember: Omit<Member, 'id'> = {
  full_name: '',
  student_code: '',
  nickname: '',
  game_account_id: '',
  email: '',
  phone: '',
  is_external: false,
  university: '',
  is_captain: false,
}

/** Adds a player (``member`` null) or fixes one. The amount due follows the
 * number of players. */
function MemberDialog({
  registration,
  tournament,
  member,
  onClose,
}: {
  registration: Registration
  tournament: Tournament
  member: Member | null
  onClose: () => void
}) {
  const team = tournament.type_of_game === 'team'
  const [form, setForm] = useState<Omit<Member, 'id'>>(member ?? emptyMember)
  const update = <K extends keyof Member>(key: K, value: Member[K]) => setForm((current) => ({ ...current, [key]: value }))
  const save = useApiMutation({
    request: () =>
      member
        ? api(`registrations/${registration.id}/members/${member.id}/`, { method: 'PATCH', body: form })
        : api(`registrations/${registration.id}/members/`, { method: 'POST', body: form }),
    invalidate: [['registrations'], ['tournament'], ['tournaments']],
    success: member ? 'Jugador actualizado' : 'Jugador agregado',
    onSuccess: onClose,
  })
  const errors = save.error?.fields ?? {}
  const newTotal = Number(tournament.fee_per_player) * (registration.members.length + 1)

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? `Editar a ${member.nickname}` : 'Agregar jugador'}
      description={
        member || Number(tournament.fee_per_player) === 0
          ? registration.display_name
          : `${registration.display_name} · el monto a pagar pasará a ${formatMoney(String(newTotal))}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {member ? 'Guardar' : 'Agregar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" error={errors.full_name}>
          {(id) => <Input id={id} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} invalid={!!errors.full_name} />}
        </Field>
        <Field label="Código de estudiante" error={errors.student_code}>
          {(id) => (
            <Input
              id={id}
              value={form.student_code}
              onChange={(e) => update('student_code', e.target.value)}
              invalid={!!errors.student_code}
              className="font-mono uppercase"
              maxLength={20}
            />
          )}
        </Field>
        <Field label="Nick en el juego" error={errors.nickname}>
          {(id) => <Input id={id} value={form.nickname} onChange={(e) => update('nickname', e.target.value)} invalid={!!errors.nickname} maxLength={50} />}
        </Field>
        <Field label="ID de cuenta" error={errors.game_account_id}>
          {(id) => (
            <Input
              id={id}
              value={form.game_account_id}
              onChange={(e) => update('game_account_id', e.target.value)}
              invalid={!!errors.game_account_id}
              maxLength={100}
            />
          )}
        </Field>
      </div>
      <div className="mt-4 space-y-3">
        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={form.is_external}
            onChange={(e) => update('is_external', e.target.checked)}
            className="size-4 cursor-pointer accent-accent"
          />
          Viene de otra universidad
        </label>
        {form.is_external && (
          <Field label="Universidad" error={errors.university}>
            {(id) => (
              <Input
                id={id}
                value={form.university}
                onChange={(e) => update('university', e.target.value)}
                invalid={!!errors.university}
                maxLength={150}
              />
            )}
          </Field>
        )}
        {team && !member?.is_captain && (
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={form.is_captain}
              onChange={(e) => update('is_captain', e.target.checked)}
              className="size-4 cursor-pointer accent-accent"
            />
            Hacer capitán (reemplaza al capitán actual)
          </label>
        )}
        {errors.is_captain && <p className="text-xs text-accent">{errors.is_captain}</p>}
      </div>
    </Modal>
  )
}
