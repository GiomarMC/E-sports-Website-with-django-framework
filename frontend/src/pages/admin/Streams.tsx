import { Broadcast, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Toggle,
} from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { api } from '../../lib/api'
import { platformLabel } from '../../lib/format'
import { useApiMutation, useGames, useMatches, useStreams } from '../../lib/queries'
import { detectPlatform } from '../../lib/streams'
import type { Platform, Stream } from '../../lib/types'

export default function StreamsPage() {
  const { canManage, isSuperadmin } = useAuth()
  const streams = useStreams()
  const games = useGames()
  const [editing, setEditing] = useState<Stream | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Stream | null>(null)
  const mine = (streams.data ?? []).filter((s) => (s.game ? canManage(s.game) : isSuperadmin))

  const live = useApiMutation({
    request: (stream: Stream) => api(`streams/${stream.id}/`, { method: 'PATCH', body: { is_live: !stream.is_live } }),
    invalidate: [['streams']],
    success: 'Stream actualizado',
  })
  const remove = useApiMutation({
    request: (stream: Stream) => api(`streams/${stream.id}/`, { method: 'DELETE' }),
    invalidate: [['streams']],
    success: 'Stream eliminado',
    onSuccess: () => setDeleting(null),
  })

  return (
    <>
      <PageHeader
        title="Streams"
        description="Pega el link del canal de Twitch, Kick o YouTube. Activa “En vivo” cuando empiece la transmisión para destacarla en el sitio."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Agregar stream
          </Button>
        }
      />
      {streams.isPending ? (
        <Skeleton className="h-48" />
      ) : streams.isError ? (
        <ErrorState message={streams.error.message} />
      ) : mine.length === 0 ? (
        <EmptyState
          icon={<Broadcast size={24} />}
          title="Sin streams"
          description="Agrega el canal donde se transmitirán los matchs."
          action={<Button onClick={() => setEditing('new')}>Agregar stream</Button>}
        />
      ) : (
        <div className="surface divide-y divide-white/[0.05]">
          {mine.map((stream) => (
            <div key={stream.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{stream.title}</p>
                  <Badge>{platformLabel[stream.platform]}</Badge>
                  {stream.is_live && <Badge tone="live">En vivo</Badge>}
                </div>
                <p className="mt-1 truncate text-xs text-ink-400">
                  {stream.game ? games.data?.find((g) => g.id === stream.game)?.name : 'Canal general'} · {stream.url}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
                  <Toggle checked={stream.is_live} onChange={() => live.mutate(stream)} label="En vivo" />
                  En vivo
                </label>
                <Button variant="secondary" size="sm" icon={<PencilSimple size={14} />} onClick={() => setEditing(stream)}>
                  Editar
                </Button>
                <button
                  onClick={() => setDeleting(stream)}
                  className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-accent-soft hover:text-accent"
                  aria-label="Eliminar stream"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <StreamForm stream={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar stream"
        description={`Se quitará “${deleting?.title}” del sitio.`}
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function StreamForm({ stream, onClose }: { stream: Stream | null; onClose: () => void }) {
  const { canManage, isSuperadmin } = useAuth()
  const games = useGames()
  const managed = (games.data ?? []).filter((g) => canManage(g.id))
  const [form, setForm] = useState({
    title: stream?.title ?? '',
    url: stream?.url ?? '',
    platform: (stream?.platform ?? 'twitch') as Platform,
    game: stream?.game ?? (isSuperadmin ? null : (managed[0]?.id ?? null)),
    match: stream?.match ?? null,
    is_live: stream?.is_live ?? false,
  })
  const matches = useMatches(form.game ? { game: form.game, hide_byes: true } : { game: -1 })
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))

  const save = useApiMutation({
    request: () =>
      stream
        ? api(`streams/${stream.id}/`, { method: 'PATCH', body: form })
        : api('streams/', { method: 'POST', body: form }),
    invalidate: [['streams'], ['matches']],
    success: 'Stream guardado',
    onSuccess: onClose,
  })
  const errors = save.error?.fields ?? {}

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={stream ? 'Editar stream' : 'Agregar stream'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="stream-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="stream-form" onSubmit={submit} className="space-y-5">
        <Field label="Link del canal o video" error={errors.url} hint="Ej. https://twitch.tv/tu_canal o https://kick.com/tu_canal">
          {(id) => (
            <Input
              id={id}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, platform: detectPlatform(e.target.value) }))}
              placeholder="https://"
            />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Título" error={errors.title}>
            {(id) => <Input id={id} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Gran final" />}
          </Field>
          <Field label="Plataforma" error={errors.platform}>
            {(id) => (
              <Select id={id} value={form.platform} onChange={(e) => set('platform', e.target.value as Platform)}>
                {Object.entries(platformLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Juego" error={errors.game}>
            {(id) => (
              <Select
                id={id}
                value={form.game ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, game: e.target.value ? Number(e.target.value) : null, match: null }))}
              >
                {isSuperadmin && <option value="">Canal general (todos)</option>}
                {managed.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Match (opcional)" error={errors.match}>
            {(id) => (
              <Select
                id={id}
                value={form.match ?? ''}
                disabled={!form.game}
                onChange={(e) => set('match', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Ninguno</option>
                {(matches.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.stage_name} · {m.participants.map((p) => p.registration_name ?? '?').join(' vs ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
          <span className="text-sm font-medium">Transmitiendo en vivo ahora</span>
          <Toggle checked={form.is_live} onChange={(v) => set('is_live', v)} label="En vivo" />
        </label>
        {errors.detail && <p className="text-sm text-accent">{errors.detail}</p>}
      </form>
    </Modal>
  )
}
