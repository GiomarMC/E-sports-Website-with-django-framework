import { CheckCircle, Clock, Crown, MagnifyingGlass, XCircle } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TournamentContacts } from '../../components/contacts'
import { Button, EmptyState, ErrorState, Input, Skeleton } from '../../components/ui'
import { formatDate, formatMoney, registrationStatusLabel } from '../../lib/format'
import { useRegistrationLookup, useRegistrationStatus } from '../../lib/queries'
import type { RegistrationStatusInfo } from '../../lib/types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_LENGTH = 3

type StatusData = Omit<RegistrationStatusInfo, 'code'> & { game_name?: string }

export default function StatusPage() {
  const [search, setSearch] = useSearchParams()
  // ``codigo`` keeps working for the links sent before the public search.
  const code = search.get('codigo') ?? ''
  const term = (search.get('buscar') ?? '').trim()
  const [value, setValue] = useState(term || code)
  const [invalid, setInvalid] = useState(false)
  const byCode = useRegistrationStatus(UUID.test(code) ? code : '')
  const lookup = useRegistrationLookup(code ? '' : term)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = value.trim()
    if (UUID.test(clean)) {
      setInvalid(false)
      setSearch({ codigo: clean })
      return
    }
    if (clean.length < MIN_LENGTH) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setSearch({ buscar: clean })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Consulta tu inscripción</h1>
      <p className="mt-2 text-ink-400">Escribe el nombre de tu equipo o tu nickname registrado.</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ej. Cóndores del Misti o Kusi"
          invalid={invalid}
          aria-label="Nombre del equipo o nickname"
          maxLength={100}
        />
        <Button type="submit" icon={<MagnifyingGlass size={16} />} size="lg" className="h-11">
          Consultar
        </Button>
      </form>
      {invalid && <p className="mt-2 text-xs text-accent">Escribe al menos {MIN_LENGTH} letras.</p>}

      <div className="mt-10 space-y-4">
        {code ? (
          byCode.isFetching && !byCode.data ? (
            <Skeleton className="h-48" />
          ) : byCode.isError ? (
            <ErrorState
              message={byCode.error.status === 404 ? 'No encontramos una inscripción con ese código.' : byCode.error.message}
            />
          ) : byCode.data ? (
            <StatusCard data={byCode.data} />
          ) : null
        ) : !term ? null : lookup.isPending ? (
          <Skeleton className="h-48" />
        ) : lookup.isError ? (
          <ErrorState message={lookup.error.message} />
        ) : lookup.data.results.length === 0 ? (
          <EmptyState
            icon={<MagnifyingGlass size={24} />}
            title="Sin resultados"
            description={`No encontramos inscripciones con “${term}”. Revisa cómo escribiste el nombre del equipo o el nickname.`}
          />
        ) : (
          <>
            <p className="text-sm text-ink-400">
              {lookup.data.results.length === 1
                ? '1 inscripción encontrada'
                : `${lookup.data.results.length} inscripciones encontradas`}
              {lookup.data.truncated && ' (se muestran las primeras; escribe el nombre completo para afinar)'}
            </p>
            {lookup.data.results.map((item, index) => (
              <StatusCard key={item.id} data={item} index={index} showContacts={lookup.data.results.length === 1 || item.status === 'rejected'} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function StatusCard({ data, index = 0, showContacts = true }: { data: StatusData; index?: number; showContacts?: boolean }) {
  const icon =
    data.status === 'confirmed' ? (
      <CheckCircle size={28} weight="fill" className="text-win" />
    ) : data.status === 'rejected' ? (
      <XCircle size={28} weight="fill" className="text-accent" />
    ) : (
      <Clock size={28} weight="fill" className="text-warn" />
    )
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), type: 'spring', stiffness: 160, damping: 22 }}
      className="surface p-6"
    >
      <div className="flex items-start gap-4">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-ink-400">
            {data.game_name ? `${data.game_name} · ` : ''}
            {data.tournament_name}
          </p>
          <p className="font-display text-2xl font-semibold">{data.display_name}</p>
          <p className="mt-1 text-sm text-ink-300">
            Estado: <strong>{registrationStatusLabel[data.status]}</strong> · Monto{' '}
            <span className="font-mono">{formatMoney(data.amount_due)}</span> · Enviada el {formatDate(data.created_at, true)}
          </p>
          {data.status === 'rejected' && data.rejection_reason && (
            <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink-100">Motivo: {data.rejection_reason}</p>
          )}
          {data.status === 'pending' && (
            <p className="mt-3 text-sm text-ink-400">
              {Number(data.amount_due) > 0
                ? 'Un administrador está revisando el comprobante de pago.'
                : 'Un administrador está revisando tu inscripción.'}
            </p>
          )}
        </div>
      </div>
      <ul className="mt-6 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        {data.members.map((member) => (
          <li key={member.nickname} className="flex items-center gap-1.5 rounded-lg bg-ink-800 px-2.5 py-1 text-sm">
            {member.is_captain && <Crown size={12} weight="fill" className="text-warn" />}
            {member.nickname}
          </li>
        ))}
      </ul>
      {showContacts && (
        <TournamentContacts
          tournamentId={data.tournament}
          title={data.status === 'rejected' ? '¿Tienes dudas sobre el rechazo? Escribe a' : 'Contacto con los organizadores'}
          className="mt-6 border-t border-white/[0.06] pt-5"
        />
      )}
    </motion.div>
  )
}
