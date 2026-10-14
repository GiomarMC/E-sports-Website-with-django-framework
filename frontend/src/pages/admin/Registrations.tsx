import {
  CheckCircle,
  ClipboardText,
  Crown,
  Eye,
  EyeSlash,
  FilePdf,
  MagnifyingGlass,
  Trash,
  Wallet,
  XCircle,
} from '@phosphor-icons/react'
import { useState } from 'react'
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
import { api } from '../../lib/api'
import { formatDate, formatMoney, registrationStatusLabel } from '../../lib/format'
import { useApiMutation, useGames, useRegistrations, useTournaments } from '../../lib/queries'
import { PaymentMethodsPanel } from './PaymentMethods'
import type { Registration, RegistrationStatus } from '../../lib/types'

export default function RegistrationsPage() {
  const [tab, setTab] = useState<'inscripciones' | 'pagos'>('inscripciones')
  return (
    <>
      <PageHeader
        title="Inscripciones"
        description="Revisa el comprobante de pago de cada inscripción y confírmala o recházala. Las inscripciones no se pueden editar."
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
              <h3 className="mb-2 text-sm font-semibold text-ink-300">Integrantes</h3>
              <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-ink-850 text-left text-xs text-ink-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nick</th>
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">ID cuenta</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
