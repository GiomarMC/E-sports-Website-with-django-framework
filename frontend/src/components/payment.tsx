import { Bank, Check, Copy, DeviceMobile, QrCode, Wallet, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { formatMoney, formatPhone } from '../lib/format'
import { usePaymentMethods } from '../lib/queries'
import type { PaymentMethod } from '../lib/types'
import { useToast } from './Toast'
import { cx, Modal, Skeleton } from './ui'

function CopyValue({ label, value, display }: { label: string; value: string; display?: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('No se pudo copiar, cópialo manualmente.')
    }
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
        <p className="truncate font-mono text-[15px] font-semibold tabular-nums text-ink-100">{display ?? value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className={cx(
          'grid size-9 shrink-0 place-items-center rounded-lg border transition active:scale-95',
          copied ? 'border-win/40 bg-win-soft text-win' : 'border-white/[0.08] text-ink-300 hover:border-white/20 hover:text-ink-100',
        )}
      >
        {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
      </button>
    </div>
  )
}

const ICONS = { yape: DeviceMobile, plin: DeviceMobile, bank_transfer: Bank, other: Wallet }

function MethodCard({ method }: { method: PaymentMethod }) {
  const [qr, setQr] = useState(false)
  const Icon = ICONS[method.method]
  const wallet = method.method === 'yape' || method.method === 'plin'
  return (
    <div className="rounded-xl border border-white/[0.07] bg-ink-850 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-700 text-ink-100">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold">{method.method === 'other' ? 'Otro medio' : method.method_display}</p>
          <p className="text-xs leading-snug text-ink-400">A nombre de {method.holder_name}</p>
        </div>
        {method.qr_image && (
          <button
            type="button"
            onClick={() => setQr(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-ink-300 transition hover:text-ink-100"
          >
            <QrCode size={14} /> Ver QR
          </button>
        )}
      </div>
      <div className="space-y-3 border-t border-white/[0.05] pt-3">
        {method.bank_name && <p className="text-sm text-ink-300">{method.bank_name}</p>}
        {method.phone_number && (
          <CopyValue
            label={wallet ? `Número de ${method.method_display}` : 'Número'}
            value={method.phone_number.replace(/\D/g, '') || method.phone_number}
            display={formatPhone(method.phone_number)}
          />
        )}
        {method.account_number && <CopyValue label="Número de cuenta" value={method.account_number} />}
        {method.cci && <CopyValue label="CCI (interbancario)" value={method.cci} />}
        {method.instructions && (
          <p className="whitespace-pre-line text-xs leading-relaxed text-ink-400">{method.instructions}</p>
        )}
      </div>
      {method.qr_image && (
        <Modal open={qr} onClose={() => setQr(false)} title={`QR de ${method.method_display}`} description={method.holder_name}>
          <img src={method.qr_image} alt={`Código QR de ${method.method_display}`} className="mx-auto max-h-[60dvh] rounded-xl bg-white p-3" />
        </Modal>
      )}
    </div>
  )
}

/** "How to pay" box of the registration form: the payment methods of the
 * game of the tournament. */
export function PaymentMethods({ gameId, amount, currency }: { gameId: number; amount: number; currency: string }) {
  const methods = usePaymentMethods(gameId)
  if (methods.isPending) return <Skeleton className="h-40" />
  if (methods.isError || !methods.data.length) {
    return (
      <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
        <Warning size={16} className="mt-px shrink-0" />
        Los organizadores aún no publican los datos de pago de este juego. Consúltales antes de pagar.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-300">
        Paga <strong className="font-mono text-ink-100">{formatMoney(amount, currency)}</strong>{' '}
        {methods.data.length > 1 ? 'por cualquiera de estos medios' : 'a esta cuenta'} y sube el comprobante.
      </p>
      {methods.data.map((method) => (
        <MethodCard key={method.id} method={method} />
      ))}
    </div>
  )
}
