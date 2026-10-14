import {
  ArrowLeft,
  CheckCircle,
  Crown,
  ImageSquare,
  LockSimple,
  MagnifyingGlass,
  Plus,
  Receipt,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TournamentContacts } from '../../components/contacts'
import { PaymentMethods } from '../../components/payment'
import { Button, cx, EmptyState, ErrorState, Field, Input, Skeleton } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { api, ApiError, toFormData } from '../../lib/api'
import { formatDate, formatMoney, playersLabel } from '../../lib/format'
import { useTournament } from '../../lib/queries'
import { registrationTotal } from '../../lib/tournament'
import type { RegisterResponse, Tournament } from '../../lib/types'

interface MemberForm {
  key: number
  full_name: string
  student_code: string
  nickname: string
  game_account_id: string
  email: string
  phone: string
}

let memberKey = 0
const emptyMember = (): MemberForm => ({
  key: memberKey++,
  full_name: '',
  student_code: '',
  nickname: '',
  game_account_id: '',
  email: '',
  phone: '',
})

export default function RegisterPage() {
  const tournamentId = Number(useParams().tournamentId)
  const tournament = useTournament(tournamentId)
  const [result, setResult] = useState<{ response: RegisterResponse; name: string } | null>(null)

  if (tournament.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (tournament.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorState message={tournament.error.message} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <Link
        to={`/juegos/${tournament.data.game}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={16} /> {tournament.data.game_name}
      </Link>
      <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">Inscripción</h1>
      <p className="mt-2 text-ink-400">{tournament.data.name}</p>

      <div className="mt-10">
        {result ? (
          <Success result={result.response} name={result.name} tournament={tournament.data} />
        ) : !tournament.data.registration.is_open ? (
          <EmptyState
            icon={<LockSimple size={24} />}
            title="Inscripciones cerradas"
            description={tournament.data.registration.reason}
          />
        ) : (
          <RegistrationForm tournament={tournament.data} onDone={(response, name) => setResult({ response, name })} />
        )}
      </div>
    </div>
  )
}

function RegistrationForm({
  tournament,
  onDone,
}: {
  tournament: Tournament
  /** ``name``: team name, or the nickname in individual games. */
  onDone: (response: RegisterResponse, name: string) => void
}) {
  const toast = useToast()
  const team = tournament.type_of_game === 'team'
  const min = tournament.min_players
  const max = tournament.max_players
  const [teamName, setTeamName] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [voucher, setVoucher] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [members, setMembers] = useState<MemberForm[]>(() => Array.from({ length: min }, emptyMember))
  const [captain, setCaptain] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const total = registrationTotal(tournament.fee_per_player, members.length)
  const needsVoucher = Number(tournament.fee_per_player) > 0
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo])

  const clearError = (key: string) =>
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })

  const update = (index: number, field: keyof MemberForm, value: string) => {
    setMembers((current) => current.map((m, i) => (i === index ? { ...m, [field]: value } : m)))
    clearError(`m${index}.${field}`)
  }

  const remove = (index: number) => {
    setMembers((current) => current.filter((_, i) => i !== index))
    setCaptain((current) => (current === index ? 0 : current > index ? current - 1 : current))
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (team && !teamName.trim()) next.team_name = 'Escribe el nombre del equipo.'
    if (!email.trim()) next.contact_email = 'Necesitamos un correo de contacto.'
    if (needsVoucher && !voucher) next.voucher = 'Sube el comprobante de pago.'
    members.forEach((member, index) => {
      if (!member.full_name.trim()) next[`m${index}.full_name`] = 'Requerido'
      if (!member.student_code.trim()) next[`m${index}.student_code`] = 'Requerido'
      if (!member.nickname.trim()) next[`m${index}.nickname`] = 'Requerido'
    })
    const codes = members.map((m) => m.student_code.trim().toUpperCase()).filter(Boolean)
    if (new Set(codes).size !== codes.length) next.members = 'Hay códigos de estudiante repetidos.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) {
      toast.error('Revisa los campos marcados.')
      return
    }
    setSending(true)
    try {
      const body = toFormData({
        team_name: team ? teamName.trim() : '',
        contact_email: email.trim(),
        contact_phone: phone.trim(),
        logo: logo ?? undefined,
        voucher: voucher ?? undefined,
        members: members.map(({ key: _key, ...member }, index) => ({ ...member, is_captain: index === captain })),
      })
      const response = await api<RegisterResponse>(`tournaments/${tournament.id}/register/`, {
        method: 'POST',
        body,
        auth: false,
      })
      onDone(response, team ? teamName.trim() : members[captain].nickname.trim())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      const apiError = error as ApiError
      setErrors(apiError.fields ?? {})
      toast.error(apiError.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-8">
        {team && (
          <fieldset className="surface p-6">
            <legend className="sr-only">Equipo</legend>
            <h2 className="mb-5 font-display text-xl font-semibold">Equipo</h2>
            <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
              <Field label="Nombre del equipo" error={errors.team_name}>
                {(id) => (
                  <Input
                    id={id}
                    value={teamName}
                    onChange={(e) => {
                      setTeamName(e.target.value)
                      clearError('team_name')
                    }}
                    invalid={!!errors.team_name}
                    placeholder="Los Cóndores de Arequipa"
                    maxLength={100}
                  />
                )}
              </Field>
              <Field label="Logo (opcional)" error={errors.logo}>
                {(id) => (
                  <label
                    htmlFor={id}
                    className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-3 text-sm text-ink-300 transition hover:border-accent/50"
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="" className="size-7 rounded-md object-cover" />
                    ) : (
                      <ImageSquare size={20} />
                    )}
                    {logo ? 'Cambiar' : 'Subir imagen'}
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
            </div>
          </fieldset>
        )}

        <fieldset className="surface p-6">
          <legend className="sr-only">Integrantes</legend>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{team ? 'Integrantes' : 'Tus datos'}</h2>
            {team && (
              <span className="text-sm text-ink-400">
                {members.length} de {playersLabel(min, max)}
              </span>
            )}
          </div>
          {team && (
            <p className="mb-5 text-sm text-ink-400">
              Marca con la corona al capitán.
              {max > min && ` Pueden agregar suplentes hasta completar ${max}.`}
            </p>
          )}
          {(errors.members || errors.student_code || errors.captain) && (
            <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {errors.members || errors.student_code || errors.captain}
            </p>
          )}
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {members.map((member, index) => (
                <motion.div
                  key={member.key}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                  className="overflow-hidden"
                >
                  <div
                    className={cx(
                      'rounded-2xl border p-4 transition-colors',
                      team && captain === index ? 'border-warn/40 bg-warn-soft/40' : 'border-white/[0.06] bg-ink-850',
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-ink-400">Jugador {index + 1}</span>
                      <div className="flex items-center gap-1">
                        {team && (
                          <button
                            type="button"
                            onClick={() => setCaptain(index)}
                            className={cx(
                              'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition',
                              captain === index ? 'bg-warn text-ink-950' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100',
                            )}
                          >
                            <Crown size={14} weight="fill" /> {captain === index ? 'Capitán' : 'Hacer capitán'}
                          </button>
                        )}
                        {team && members.length > min && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-accent-soft hover:text-accent"
                            aria-label={`Quitar jugador ${index + 1}`}
                          >
                            <Trash size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Nombre completo" error={errors[`m${index}.full_name`]}>
                        {(id) => (
                          <Input
                            id={id}
                            value={member.full_name}
                            onChange={(e) => update(index, 'full_name', e.target.value)}
                            invalid={!!errors[`m${index}.full_name`]}
                            autoComplete="off"
                          />
                        )}
                      </Field>
                      <Field label="Código de estudiante" error={errors[`m${index}.student_code`]}>
                        {(id) => (
                          <Input
                            id={id}
                            value={member.student_code}
                            onChange={(e) => update(index, 'student_code', e.target.value)}
                            invalid={!!errors[`m${index}.student_code`]}
                            className="font-mono uppercase"
                            maxLength={20}
                          />
                        )}
                      </Field>
                      <Field label="Nick en el juego" error={errors[`m${index}.nickname`]}>
                        {(id) => (
                          <Input
                            id={id}
                            value={member.nickname}
                            onChange={(e) => update(index, 'nickname', e.target.value)}
                            invalid={!!errors[`m${index}.nickname`]}
                            maxLength={50}
                          />
                        )}
                      </Field>
                      <Field label="ID de cuenta (opcional)" hint="Friend ID, Steam ID, tag, etc.">
                        {(id) => (
                          <Input
                            id={id}
                            value={member.game_account_id}
                            onChange={(e) => update(index, 'game_account_id', e.target.value)}
                            maxLength={100}
                          />
                        )}
                      </Field>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {team && members.length < max && (
            <Button
              variant="secondary"
              className="mt-4 w-full border-dashed"
              icon={<Plus size={16} />}
              onClick={() => setMembers((current) => [...current, emptyMember()])}
            >
              Agregar jugador ({members.length + 1} de {max})
            </Button>
          )}
        </fieldset>

        <fieldset className="surface p-6">
          <legend className="sr-only">Contacto</legend>
          <h2 className="mb-5 font-display text-xl font-semibold">Contacto</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Correo"
              error={errors.contact_email}
              hint="Por aquí te contactarán los organizadores."
            >
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearError('contact_email')
                  }}
                  invalid={!!errors.contact_email}
                  autoComplete="email"
                />
              )}
            </Field>
            <Field label="Celular (opcional)" error={errors.contact_phone}>
              {(id) => (
                <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              )}
            </Field>
          </div>
        </fieldset>
      </div>

      <aside className="h-fit space-y-4 lg:sticky lg:top-24">
        <div className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-6 py-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Receipt size={20} /> Resumen de pago
            </h2>
          </div>
          <dl className="space-y-3 px-6 py-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-400">Por jugador</dt>
              <dd className="font-mono">{formatMoney(tournament.fee_per_player, tournament.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-400">Jugadores</dt>
              <dd className="font-mono">× {members.length}</dd>
            </div>
            <div className="flex items-end justify-between border-t border-white/[0.06] pt-4">
              <dt className="font-medium">Total</dt>
              <motion.dd
                key={total}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono text-3xl font-semibold text-ink-100"
              >
                {formatMoney(total, tournament.currency)}
              </motion.dd>
            </div>
          </dl>
          {needsVoucher && (
            <div className="space-y-5 border-t border-white/[0.06] px-6 py-5">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">Cómo pagar</h3>
                <PaymentMethods gameId={tournament.game} amount={total} currency={tournament.currency} />
              </div>
              <Field label="Comprobante de pago" error={errors.voucher} hint="Imagen o PDF del voucher (máx. 5 MB).">
                {(id) => (
                  <label
                    htmlFor={id}
                    className={cx(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center text-sm transition',
                      voucher ? 'border-win/40 bg-win-soft text-win' : 'border-white/15 text-ink-300 hover:border-accent/50',
                      errors.voucher && 'border-accent/60',
                    )}
                  >
                    {voucher ? <CheckCircle size={24} weight="fill" /> : <UploadSimple size={24} />}
                    <span className="max-w-full truncate">{voucher ? voucher.name : 'Subir comprobante'}</span>
                    <input
                      id={id}
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        setVoucher(e.target.files?.[0] ?? null)
                        clearError('voucher')
                      }}
                    />
                  </label>
                )}
              </Field>
            </div>
          )}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={sending}>
          Enviar inscripción
        </Button>
        <p className="text-xs leading-relaxed text-ink-400">
          Al enviar, la inscripción queda registrada tal cual y no se puede editar. Un administrador revisará el pago y
          confirmará al equipo.
          {tournament.registration.ends_at && <> Inscripciones hasta el {formatDate(tournament.registration.ends_at, true)}.</>}
        </p>
        <TournamentContacts tournamentId={tournament.id} title="¿Dudas? Escribe a los organizadores" />
      </aside>
    </form>
  )
}

function Success({ result, tournament, name }: { result: RegisterResponse; tournament: Tournament; name: string }) {
  const team = tournament.type_of_game === 'team'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 20 }}
      className="surface mx-auto max-w-2xl p-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        className="mb-6 grid size-14 place-items-center rounded-2xl bg-win-soft text-win"
      >
        <CheckCircle size={32} weight="fill" />
      </motion.div>
      <h2 className="font-display text-3xl font-semibold">Inscripción enviada</h2>
      <p className="mt-2 leading-relaxed text-ink-300">
        Total registrado: <strong className="font-mono">{formatMoney(result.amount_due, tournament.currency)}</strong>. Un
        administrador {Number(result.amount_due) > 0 ? 'revisará tu comprobante' : 'revisará y confirmará tu inscripción'}.
      </p>
      <p className="mt-4 flex gap-3 rounded-xl border border-white/[0.08] bg-ink-850 px-4 py-3 text-sm leading-relaxed text-ink-300">
        <MagnifyingGlass size={18} className="mt-0.5 shrink-0 text-ink-100" />
        <span>
          Consulta el estado de tu inscripción en <strong className="text-ink-100">Mi inscripción</strong> ingresando{' '}
          {team ? 'el nombre de tu equipo' : 'tu nickname'}{' '}
          <strong className="text-ink-100">“{name}”</strong>
          {team && ' o el nickname de cualquier integrante'}.
        </span>
      </p>
      <TournamentContacts
        tournamentId={tournament.id}
        title="Mantente en contacto con los organizadores"
        className="mt-8"
      />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={`/inscripcion/estado?buscar=${encodeURIComponent(name)}`}>
          <Button>Ver estado</Button>
        </Link>
        <Link to={`/juegos/${tournament.game}`}>
          <Button variant="ghost">Volver al torneo</Button>
        </Link>
      </div>
    </motion.div>
  )
}
