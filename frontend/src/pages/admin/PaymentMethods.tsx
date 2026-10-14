import { Bank, DeviceMobile, ImageSquare, PencilSimple, Plus, Trash, Wallet, Warning } from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea, Toggle } from '../../components/ui'
import { api, toFormData } from '../../lib/api'
import { formatPhone, paymentMethodLabel } from '../../lib/format'
import { useApiMutation, usePaymentMethods } from '../../lib/queries'
import type { PaymentMethod, PaymentMethodType } from '../../lib/types'

const ICONS = { yape: DeviceMobile, plin: DeviceMobile, bank_transfer: Bank, other: Wallet }

function summary(method: PaymentMethod) {
  if (method.method === 'bank_transfer') {
    return [method.bank_name, method.account_number, method.cci && `CCI ${method.cci}`].filter(Boolean).join(' · ')
  }
  return [method.phone_number && formatPhone(method.phone_number), method.account_number].filter(Boolean).join(' · ')
}

/** Payment data of a game (Yape, Plin, bank account...) shown to the players
 * in the registration form of every tournament of the game. */
export function PaymentMethodsPanel({ gameId, gameName, paid = true }: { gameId: number; gameName: string; paid?: boolean }) {
  const methods = usePaymentMethods(gameId)
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null)
  const [deleting, setDeleting] = useState<PaymentMethod | null>(null)
  const toggle = useApiMutation({
    request: (method: PaymentMethod) =>
      api(`payment-methods/${method.id}/`, { method: 'PATCH', body: { active: !method.active } }),
    invalidate: [['payment-methods']],
    success: 'Método actualizado',
  })
  const remove = useApiMutation({
    request: (method: PaymentMethod) => api(`payment-methods/${method.id}/`, { method: 'DELETE' }),
    invalidate: [['payment-methods']],
    success: 'Método eliminado',
    onSuccess: () => setDeleting(null),
  })
  const active = (methods.data ?? []).filter((m) => m.active)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Métodos de pago de {gameName}</h2>
          <p className="text-sm text-ink-400">
            Se muestran en el formulario de inscripción de todos los torneos de este juego, junto al comprobante.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
          Agregar método
        </Button>
      </div>

      {paid && methods.isSuccess && active.length === 0 && (
        <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <Warning size={18} className="mt-px shrink-0" />
          La inscripción tiene costo pero no hay un método de pago activo: los jugadores no sabrán a dónde pagar.
        </p>
      )}

      {methods.isPending ? (
        <Skeleton className="h-32" />
      ) : methods.isError ? (
        <ErrorState message={methods.error.message} onRetry={() => methods.refetch()} />
      ) : methods.data.length === 0 ? (
        <EmptyState
          icon={<Wallet size={24} />}
          title="Sin métodos de pago"
          description="Agrega el número de Yape o Plin, o la cuenta bancaria donde se recibirán los pagos."
          action={<Button onClick={() => setEditing('new')}>Agregar método</Button>}
        />
      ) : (
        <div className="surface divide-y divide-white/[0.05]">
          {methods.data.map((method) => {
            const Icon = ICONS[method.method]
            return (
              <div key={method.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <span className="grid size-10 place-items-center rounded-xl bg-ink-800 text-ink-100">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{method.method_display}</p>
                    {!method.active && <Badge>Oculto</Badge>}
                    {method.qr_image && <Badge>Con QR</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-300">{summary(method) || method.instructions}</p>
                  <p className="text-xs text-ink-400">A nombre de {method.holder_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
                    <Toggle checked={method.active} onChange={() => toggle.mutate(method)} label="Visible" />
                    Visible
                  </label>
                  <Button variant="secondary" size="sm" icon={<PencilSimple size={14} />} onClick={() => setEditing(method)}>
                    Editar
                  </Button>
                  <button
                    onClick={() => setDeleting(method)}
                    className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-accent-soft hover:text-accent"
                    aria-label="Eliminar método de pago"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <PaymentMethodForm
          gameId={gameId}
          method={editing === 'new' ? null : editing}
          order={methods.data?.length ?? 0}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar método de pago"
        description={`Se quitará ${deleting?.method_display} de ${deleting?.holder_name}. Las inscripciones ya enviadas no cambian.`}
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}

function PaymentMethodForm({
  gameId,
  method,
  order,
  onClose,
}: {
  gameId: number
  method: PaymentMethod | null
  order: number
  onClose: () => void
}) {
  const [form, setForm] = useState({
    method: (method?.method ?? 'yape') as PaymentMethodType,
    holder_name: method?.holder_name ?? '',
    phone_number: method?.phone_number ?? '',
    bank_name: method?.bank_name ?? '',
    account_number: method?.account_number ?? '',
    cci: method?.cci ?? '',
    instructions: method?.instructions ?? '',
    active: method?.active ?? true,
  })
  const [qr, setQr] = useState<File | null>(null)
  const [removeQr, setRemoveQr] = useState(false)
  const qrPreview = useMemo(() => (qr ? URL.createObjectURL(qr) : null), [qr])
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))
  const wallet = form.method === 'yape' || form.method === 'plin'
  const bank = form.method === 'bank_transfer'

  const save = useApiMutation({
    request: () => {
      // Only the fields of the chosen method are kept.
      const body = toFormData({
        ...form,
        phone_number: wallet || form.method === 'other' ? form.phone_number.trim() : '',
        bank_name: bank ? form.bank_name.trim() : '',
        account_number: wallet ? '' : form.account_number.trim(),
        cci: bank ? form.cci.trim() : '',
        game: gameId,
        qr_image: qr ?? undefined,
        remove_qr: removeQr && !qr ? true : undefined,
        order: method ? undefined : order,
      })
      return method
        ? api(`payment-methods/${method.id}/`, { method: 'PATCH', body })
        : api('payment-methods/', { method: 'POST', body })
    },
    invalidate: [['payment-methods']],
    success: 'Método de pago guardado',
    onSuccess: onClose,
  })
  const errors = save.error?.fields ?? {}
  const currentQr = qrPreview ?? (removeQr ? null : method?.qr_image)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={method ? 'Editar método de pago' : 'Agregar método de pago'}
      description="Solo pagos digitales. Revisa bien el número: los jugadores pagarán ahí."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="payment-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Medio de pago" error={errors.method}>
            {(id) => (
              <Select id={id} value={form.method} onChange={(e) => set('method', e.target.value as PaymentMethodType)}>
                {Object.entries(paymentMethodLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Titular" error={errors.holder_name} hint="Nombre que verá el jugador al pagar.">
            {(id) => (
              <Input id={id} value={form.holder_name} onChange={(e) => set('holder_name', e.target.value)} maxLength={150} />
            )}
          </Field>
          {(wallet || form.method === 'other') && (
            <Field
              label={wallet ? `Número de ${paymentMethodLabel[form.method]}` : 'Número (opcional)'}
              error={errors.phone_number}
            >
              {(id) => (
                <Input
                  id={id}
                  type="tel"
                  inputMode="numeric"
                  value={form.phone_number}
                  onChange={(e) => set('phone_number', e.target.value)}
                  placeholder="987 654 321"
                  className="font-mono"
                  maxLength={20}
                />
              )}
            </Field>
          )}
          {bank && (
            <Field label="Banco" error={errors.bank_name}>
              {(id) => (
                <Input
                  id={id}
                  value={form.bank_name}
                  onChange={(e) => set('bank_name', e.target.value)}
                  placeholder="BCP, Interbank, BBVA..."
                  maxLength={100}
                />
              )}
            </Field>
          )}
          {!wallet && (
            <Field label={bank ? 'Número de cuenta' : 'Cuenta (opcional)'} error={errors.account_number}>
              {(id) => (
                <Input
                  id={id}
                  value={form.account_number}
                  onChange={(e) => set('account_number', e.target.value)}
                  className="font-mono"
                  maxLength={40}
                />
              )}
            </Field>
          )}
          {bank && (
            <Field label="CCI (opcional)" error={errors.cci} hint="Para transferencias desde otros bancos.">
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={form.cci}
                  onChange={(e) => set('cci', e.target.value)}
                  className="font-mono"
                  maxLength={30}
                />
              )}
            </Field>
          )}
        </div>
        <Field label="Código QR (opcional)" error={errors.qr_image} hint="Imagen del QR para escanear desde la app.">
          {(id) => (
            <div className="flex items-center gap-3">
              <label
                htmlFor={id}
                className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-3 text-sm text-ink-300 transition hover:border-accent/50"
              >
                {currentQr ? (
                  <img src={currentQr} alt="" className="size-7 rounded-md bg-white object-contain" />
                ) : (
                  <ImageSquare size={20} />
                )}
                {currentQr ? 'Cambiar QR' : 'Subir QR'}
                <input
                  id={id}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    setQr(e.target.files?.[0] ?? null)
                    setRemoveQr(false)
                  }}
                />
              </label>
              {currentQr && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQr(null)
                    setRemoveQr(true)
                  }}
                >
                  Quitar
                </Button>
              )}
            </div>
          )}
        </Field>
        <Field
          label={form.method === 'other' ? 'Cómo pagar' : 'Indicaciones (opcional)'}
          error={errors.instructions}
          hint="Ej. En el mensaje del Yape escribe el nombre del equipo."
        >
          {(id) => (
            <Textarea id={id} rows={3} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
          )}
        </Field>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
          <span className="text-sm font-medium">Visible en el formulario de inscripción</span>
          <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Visible" />
        </label>
        {errors.detail && <p className="text-sm text-accent">{errors.detail}</p>}
      </form>
    </Modal>
  )
}
