import { FilePdf, GameController, ImageSquare, PencilSimple, Plus, UploadSimple } from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Textarea,
  Toggle,
} from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { api, toFormData } from '../../lib/api'
import { playersLabel } from '../../lib/format'
import { useApiMutation, useGames } from '../../lib/queries'
import type { Game, GameType } from '../../lib/types'

export default function GamesPage() {
  const { canManage, isSuperadmin } = useAuth()
  const games = useGames()
  const [editing, setEditing] = useState<Game | 'new' | null>(null)
  const mine = (games.data ?? []).filter((game) => canManage(game.id))

  const toggle = useApiMutation({
    request: (game: Game) => api(`games/${game.id}/${game.active ? 'deactivate' : 'activate'}/`, { method: 'POST' }),
    invalidate: [['games'], ['tournaments']],
    success: 'Juego actualizado',
  })

  return (
    <>
      <PageHeader
        title="Juegos"
        description="Imagen, descripción, reglas y bases de cada juego. Esto es lo que ven los jugadores en la página del torneo."
        actions={
          isSuperadmin && (
            <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Nuevo juego
            </Button>
          )
        }
      />
      {games.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : games.isError ? (
        <ErrorState message={games.error.message} />
      ) : mine.length === 0 ? (
        <EmptyState
          icon={<GameController size={24} />}
          title={isSuperadmin ? 'Aún no hay juegos' : 'No tienes juegos asignados'}
          description={isSuperadmin ? 'Crea el primer juego del evento.' : 'Pide al superadministrador que te asigne un juego.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((game) => (
            <div key={game.id} className="surface overflow-hidden">
              <div className="relative aspect-[16/7] bg-ink-800">
                {game.images ? (
                  <img src={game.images} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-ink-600">
                    <ImageSquare size={40} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900 to-transparent" />
                <p className="absolute bottom-3 left-4 font-display text-2xl font-bold uppercase">{game.name}</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{game.type_of_game === 'team' ? 'Equipos' : 'Individual'}</Badge>
                  <Badge>{playersLabel(game.min_players, game.max_players)}</Badge>
                  <Badge tone={game.bases ? 'win' : 'warn'}>{game.bases ? 'Bases subidas' : 'Sin bases'}</Badge>
                  {!game.active && <Badge tone="accent">Oculto</Badge>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {isSuperadmin ? (
                    <label className="flex items-center gap-2 text-sm text-ink-300">
                      <Toggle checked={game.active} onChange={() => toggle.mutate(game)} label="Visible" />
                      Visible en el sitio
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button variant="secondary" icon={<PencilSimple size={16} />} onClick={() => setEditing(game)}>
                    Editar contenido
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <GameForm game={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function GameForm({ game, onClose }: { game: Game | null; onClose: () => void }) {
  const { isSuperadmin } = useAuth()
  const [form, setForm] = useState({
    name: game?.name ?? '',
    type_of_game: (game?.type_of_game ?? 'team') as GameType,
    description: game?.description ?? '',
    rules: game?.rules ?? '',
    min_players: game?.min_players ?? 5,
    max_players: game?.max_players ?? 7,
  })
  const [image, setImage] = useState<File | null>(null)
  const [bases, setBases] = useState<File | null>(null)
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : game?.images ?? null), [image, game])
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))
  const individual = form.type_of_game === 'individual'

  const save = useApiMutation({
    request: () => {
      const body = toFormData({
        ...(isSuperadmin ? { name: form.name, type_of_game: form.type_of_game } : {}),
        description: form.description,
        rules: form.rules,
        min_players: individual ? 1 : form.min_players,
        max_players: individual ? 1 : form.max_players,
        images: image ?? undefined,
        bases: bases ?? undefined,
      })
      return game ? api(`games/${game.id}/`, { method: 'PATCH', body }) : api('games/', { method: 'POST', body })
    },
    invalidate: [['games'], ['tournaments'], ['tournament']],
    success: game ? 'Juego actualizado' : 'Juego creado',
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
      wide
      onClose={onClose}
      title={game ? `Editar ${game.name}` : 'Nuevo juego'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="game-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="game-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        {isSuperadmin && (
          <>
            <Field label="Nombre" error={errors.name}>
              {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dota 2" />}
            </Field>
            <Field label="Modalidad" error={errors.type_of_game}>
              {(id) => (
                <Select id={id} value={form.type_of_game} onChange={(e) => set('type_of_game', e.target.value as GameType)}>
                  <option value="team">Por equipos</option>
                  <option value="individual">Individual</option>
                </Select>
              )}
            </Field>
          </>
        )}
        {!individual && (
          <>
            <Field label="Mínimo de jugadores" error={errors.min_players}>
              {(id) => (
                <NumberInput id={id} min={2} value={form.min_players} onValueChange={(v) => set('min_players', v)} />
              )}
            </Field>
            <Field label="Máximo (con suplentes)" error={errors.max_players}>
              {(id) => (
                <NumberInput
                  id={id}
                  min={form.min_players}
                  value={form.max_players}
                  onValueChange={(v) => set('max_players', v)}
                />
              )}
            </Field>
          </>
        )}
        <Field label="Descripción" error={errors.description} className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <Field label="Reglas (texto)" error={errors.rules} hint="Se muestran en la pestaña Reglas." className="sm:col-span-2">
          {(id) => <Textarea id={id} className="min-h-40" value={form.rules} onChange={(e) => set('rules', e.target.value)} />}
        </Field>
        <Field label="Imagen de portada" error={errors.images} hint="JPG, PNG o WEBP horizontal. Máx. 5 MB.">
          {(id) => (
            <label htmlFor={id} className="group block cursor-pointer overflow-hidden rounded-xl border border-dashed border-white/15 transition hover:border-accent/50">
              <div className="relative aspect-video bg-ink-850">
                {preview ? (
                  <img src={preview} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-ink-400">
                    <ImageSquare size={32} />
                  </div>
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-ink-950/70 py-2 text-xs font-medium">
                  <UploadSimple size={14} /> {preview ? 'Cambiar imagen' : 'Subir imagen'}
                </span>
              </div>
              <input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </Field>
        <Field label="Bases (PDF)" error={errors.bases} hint="Documento oficial con las reglas.">
          {(id) => (
            <label
              htmlFor={id}
              className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-ink-850 px-4 text-center text-sm text-ink-300 transition hover:border-accent/50"
            >
              <FilePdf size={32} className={bases || game?.bases ? 'text-accent' : ''} />
              <span className="max-w-full truncate">
                {bases ? bases.name : game?.bases ? 'Reemplazar PDF actual' : 'Subir PDF'}
              </span>
              <input
                id={id}
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => setBases(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </Field>
        {errors.detail && <p className="text-sm text-accent sm:col-span-2">{errors.detail}</p>}
      </form>
    </Modal>
  )
}
