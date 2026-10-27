import { ArrowsClockwise, Copy, Eye, EyeSlash, PaperPlaneTilt, Plus, Trash, WebhooksLogo } from '@phosphor-icons/react'
import { useState } from 'react'
import { useToast } from '../../components/Toast'
import { Badge, Button, ConfirmDialog, cx, EmptyState, ErrorState, Field, Input, Skeleton, Toggle } from '../../components/ui'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useApiMutation, useWebhooks } from '../../lib/queries'
import type { Webhook, WebhookEvent } from '../../lib/types'

const EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: 'match.scheduled', label: 'Match programado' },
  { value: 'match.started', label: 'Match en vivo' },
  { value: 'stream.live', label: 'Transmisión en vivo' },
  { value: 'match.result', label: 'Resultado oficial' },
]

const invalidate = [['webhooks']]

/** Addresses (bots) the site notifies when something public happens. */
export function WebhooksPanel() {
  const webhooks = useWebhooks()
  return (
    <section className="surface mt-6 space-y-5 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Avisos automáticos (webhooks)</h2>
        <p className="text-sm text-ink-400">
          El sitio envía un aviso a estas direcciones cuando se programa un match, empieza, se activa una transmisión o se
          publica un resultado. Sirve para que un bot (por ejemplo, de Discord) lo anuncie. Solo se envían datos
          públicos.
        </p>
      </div>
      {webhooks.isPending ? (
        <Skeleton className="h-24" />
      ) : webhooks.isError ? (
        <ErrorState message={webhooks.error.message} onRetry={() => webhooks.refetch()} />
      ) : webhooks.data.length === 0 ? (
        <EmptyState
          icon={<WebhooksLogo size={24} />}
          title="Sin direcciones"
          description="Agrega la dirección que te dé el bot para que reciba los avisos."
        />
      ) : (
        <ul className="space-y-3">
          {webhooks.data.map((hook) => (
            <WebhookItem key={hook.id} hook={hook} />
          ))}
        </ul>
      )}
      <AddWebhook />
    </section>
  )
}

function WebhookItem({ hook }: { hook: Webhook }) {
  const toast = useToast()
  const [showSecret, setShowSecret] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [rotating, setRotating] = useState(false)
  const update = useApiMutation({
    request: (body: Partial<Webhook>) => api(`webhooks/${hook.id}/`, { method: 'PATCH', body }),
    invalidate,
    success: 'Actualizado',
  })
  const ping = useApiMutation({
    request: () => api<{ ok: boolean; status: string }>(`webhooks/${hook.id}/test/`, { method: 'POST' }),
    invalidate,
    onSuccess: (result) =>
      result.ok ? toast.success(`El bot respondió (${result.status})`) : toast.error(`No respondió: ${result.status}`),
  })
  const rotate = useApiMutation({
    request: () => api(`webhooks/${hook.id}/rotate-secret/`, { method: 'POST' }),
    invalidate,
    success: 'Clave nueva generada',
    onSuccess: () => {
      setRotating(false)
      setShowSecret(true)
    },
  })
  const remove = useApiMutation({
    request: () => api(`webhooks/${hook.id}/`, { method: 'DELETE' }),
    invalidate,
    success: 'Dirección eliminada',
  })

  // Empty list: every event (also the ones added later).
  const subscribed = (event: WebhookEvent) => hook.events.length === 0 || hook.events.includes(event)
  const toggleEvent = (event: WebhookEvent) => {
    const current = EVENTS.map((e) => e.value).filter(subscribed)
    const next = current.includes(event) ? current.filter((e) => e !== event) : [...current, event]
    update.mutate({ events: next.length === EVENTS.length ? [] : next })
  }
  const delivered = hook.last_status.startsWith('HTTP 2')

  return (
    <li className="rounded-xl border border-white/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{hook.name}</p>
          <p className="truncate font-mono text-xs text-ink-400">{hook.url}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <Toggle checked={hook.active} onChange={(active) => update.mutate({ active })} label="Activo" />
          {hook.active ? 'Activo' : 'Pausado'}
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EVENTS.map((event) => (
          <button
            key={event.value}
            onClick={() => toggleEvent(event.value)}
            disabled={update.isPending || (subscribed(event.value) && hook.events.length === 1)}
            className={cx(
              'h-8 rounded-lg border px-3 text-xs font-medium transition disabled:cursor-not-allowed',
              subscribed(event.value)
                ? 'border-accent/40 bg-accent-soft text-ink-100'
                : 'border-white/[0.08] text-ink-400 hover:text-ink-100',
            )}
            aria-pressed={subscribed(event.value)}
          >
            {event.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
        <span>Clave:</span>
        <code className="min-w-0 truncate rounded-md bg-ink-850 px-2 py-1 font-mono text-ink-300">
          {showSecret ? hook.secret : '•'.repeat(24)}
        </code>
        <button
          onClick={() => setShowSecret((v) => !v)}
          className="grid size-7 place-items-center rounded-md hover:bg-white/5 hover:text-ink-100"
          aria-label={showSecret ? 'Ocultar clave' : 'Mostrar clave'}
        >
          {showSecret ? <EyeSlash size={14} /> : <Eye size={14} />}
        </button>
        <button
          onClick={() =>
            navigator.clipboard.writeText(hook.secret).then(
              () => toast.success('Clave copiada'),
              () => toast.error('No se pudo copiar'),
            )
          }
          className="grid size-7 place-items-center rounded-md hover:bg-white/5 hover:text-ink-100"
          aria-label="Copiar clave"
        >
          <Copy size={14} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-400">
          {hook.last_delivery_at ? (
            <>
              Último aviso {formatDate(hook.last_delivery_at, true)}{' '}
              <Badge tone={delivered ? 'win' : 'accent'}>{delivered ? 'entregado' : hook.last_status}</Badge>
            </>
          ) : (
            'Aún no se ha enviado ningún aviso.'
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<PaperPlaneTilt size={14} />} loading={ping.isPending} onClick={() => ping.mutate()}>
            Probar
          </Button>
          <Button variant="ghost" size="sm" icon={<ArrowsClockwise size={14} />} onClick={() => setRotating(true)}>
            Nueva clave
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash size={14} />} onClick={() => setDeleting(true)}>
            Eliminar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={rotating}
        title="Generar una clave nueva"
        description="La clave actual deja de servir: el bot rechazará los avisos hasta que le pongas la nueva."
        confirmLabel="Generar"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
        onClose={() => setRotating(false)}
      />
      <ConfirmDialog
        open={deleting}
        title="Eliminar dirección"
        description={`“${hook.name}” dejará de recibir avisos.`}
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
    </li>
  )
}

function AddWebhook() {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const add = useApiMutation({
    request: () => api('webhooks/', { method: 'POST', body: { name, url, events: [] } }),
    invalidate,
    success: 'Dirección agregada',
    onSuccess: () => {
      setName('')
      setUrl('')
    },
  })
  const errors = add.error?.fields ?? {}
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        add.mutate()
      }}
      className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end"
    >
      <Field label="Nombre" error={errors.name}>
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bot de Discord" />}
      </Field>
      <Field label="Dirección" error={errors.url}>
        {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
      </Field>
      <Button type="submit" icon={<Plus size={16} />} loading={add.isPending} disabled={!name || !url} className="h-11">
        Agregar
      </Button>
    </form>
  )
}
