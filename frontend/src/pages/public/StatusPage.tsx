import { CheckCircle, Clock, Crown, MagnifyingGlass, XCircle } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, ErrorState, Input, Skeleton } from '../../components/ui'
import { formatDate, formatMoney, registrationStatusLabel } from '../../lib/format'
import { useRegistrationStatus } from '../../lib/queries'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function StatusPage() {
  const [search, setSearch] = useSearchParams()
  const code = search.get('codigo') ?? ''
  const [value, setValue] = useState(code)
  const [invalid, setInvalid] = useState(false)
  const status = useRegistrationStatus(UUID.test(code) ? code : '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = value.trim()
    if (!UUID.test(clean)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setSearch({ codigo: clean })
  }

  const data = status.data
  const icon =
    data?.status === 'confirmed' ? (
      <CheckCircle size={28} weight="fill" className="text-win" />
    ) : data?.status === 'rejected' ? (
      <XCircle size={28} weight="fill" className="text-accent" />
    ) : (
      <Clock size={28} weight="fill" className="text-warn" />
    )

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Consulta tu inscripción</h1>
      <p className="mt-2 text-ink-400">Ingresa el código que recibiste al enviar la inscripción.</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="font-mono"
          invalid={invalid}
          aria-label="Código de inscripción"
        />
        <Button type="submit" icon={<MagnifyingGlass size={16} />} size="lg" className="h-11">
          Consultar
        </Button>
      </form>
      {invalid && <p className="mt-2 text-xs text-accent">El código no tiene el formato correcto.</p>}

      <div className="mt-10">
        {status.isFetching && !data ? (
          <Skeleton className="h-48" />
        ) : status.isError ? (
          <ErrorState message={status.error.status === 404 ? 'No encontramos una inscripción con ese código.' : status.error.message} />
        ) : data ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface p-6">
            <div className="flex items-start gap-4">
              {icon}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-ink-400">{data.tournament_name}</p>
                <p className="font-display text-2xl font-semibold">{data.display_name}</p>
                <p className="mt-1 text-sm text-ink-300">
                  Estado: <strong>{registrationStatusLabel[data.status]}</strong> · Monto{' '}
                  <span className="font-mono">{formatMoney(data.amount_due)}</span> · Enviada el {formatDate(data.created_at, true)}
                </p>
                {data.status === 'rejected' && data.rejection_reason && (
                  <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink-100">
                    Motivo: {data.rejection_reason}
                  </p>
                )}
                {data.status === 'pending' && (
                  <p className="mt-3 text-sm text-ink-400">Un administrador está revisando el comprobante de pago.</p>
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
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}
