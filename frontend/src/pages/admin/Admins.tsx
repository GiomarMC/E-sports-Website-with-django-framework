import { Check, GameController, Key, Plus, Trash, UsersThree } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
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
} from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { api } from '../../lib/api'
import { useAdmins, useApiMutation, useGames } from '../../lib/queries'
import type { AdminUser, Role } from '../../lib/types'

export default function AdminsPage() {
  const { user } = useAuth()
  const admins = useAdmins()
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)

  const remove = useApiMutation({
    request: (admin: AdminUser) => api(`admin/${admin.id}/`, { method: 'DELETE' }),
    invalidate: [['admins']],
    success: 'Administrador eliminado',
    onSuccess: () => setDeleting(null),
  })

  return (
    <>
      <PageHeader
        title="Administradores"
        description="Crea cuentas para los encargados de cada juego. Un admin de juego solo ve y gestiona los juegos que le asignes."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            Nuevo administrador
          </Button>
        }
      />
      {admins.isPending ? (
        <Skeleton className="h-60" />
      ) : admins.isError ? (
        <ErrorState message={admins.error.message} />
      ) : admins.data.length === 0 ? (
        <EmptyState icon={<UsersThree size={24} />} title="Sin administradores" />
      ) : (
        <div className="surface divide-y divide-white/[0.05]">
          {admins.data.map((admin) => (
            <div key={admin.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{admin.username}</p>
                  {(admin.first_name || admin.last_name) && (
                    <span className="text-sm text-ink-400">
                      {admin.first_name} {admin.last_name}
                    </span>
                  )}
                  <Badge tone={admin.role === 'superadmin' ? 'accent' : 'neutral'}>
                    {admin.role === 'superadmin' ? 'Superadmin' : 'Admin de juego'}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {admin.role === 'superadmin' ? (
                    <span className="text-xs text-ink-400">Gestiona todos los juegos</span>
                  ) : admin.games.length ? (
                    admin.games.map((game) => (
                      <span key={game.id} className="rounded-md bg-ink-800 px-2 py-0.5 text-xs text-ink-300">
                        {game.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-warn">Sin juegos asignados</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {admin.role === 'admin' && (
                  <Button variant="secondary" size="sm" icon={<GameController size={14} />} onClick={() => setAssigning(admin)}>
                    Asignar juegos
                  </Button>
                )}
                <Button variant="secondary" size="sm" icon={<Key size={14} />} onClick={() => setResetting(admin)}>
                  Contraseña
                </Button>
                {admin.id !== user?.id && (
                  <Button variant="ghost" size="sm" icon={<Trash size={14} />} onClick={() => setDeleting(admin)}>
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <AdminForm onClose={() => setCreating(false)} />}
      {assigning && <AssignGames admin={assigning} onClose={() => setAssigning(null)} />}
      {resetting && <ResetPassword admin={resetting} onClose={() => setResetting(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar administrador"
        description={`La cuenta “${deleting?.username}” dejará de tener acceso al panel.`}
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function GamePicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const games = useGames()
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(games.data ?? []).map((game) => {
        const active = value.includes(game.id)
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => onChange(active ? value.filter((id) => id !== game.id) : [...value, game.id])}
            className={cx(
              'flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition',
              active ? 'border-accent bg-accent-soft' : 'border-white/[0.08] hover:border-white/20',
            )}
          >
            <span
              className={cx(
                'grid size-5 place-items-center rounded-md border text-[10px]',
                active ? 'border-accent bg-accent text-accent-ink' : 'border-white/20',
              )}
            >
              {active && <Check size={12} weight="bold" />}
            </span>
            {game.name}
          </button>
        )
      })}
    </div>
  )
}

function AdminForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'admin' as Role,
    first_name: '',
    last_name: '',
    email: '',
    game_ids: [] as number[],
  })
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))
  const save = useApiMutation({
    request: () => api('admin/', { method: 'POST', body: form }),
    invalidate: [['admins']],
    success: 'Administrador creado',
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
      title="Nuevo administrador"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="admin-form" loading={save.isPending}>
            Crear cuenta
          </Button>
        </>
      }
    >
      <form id="admin-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <Field label="Usuario" error={errors.username}>
          {(id) => <Input id={id} value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Contraseña" error={errors.password} hint="Mínimo 8 caracteres, no solo números.">
          {(id) => (
            <Input
              id={id}
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Field label="Nombres" error={errors.first_name}>
          {(id) => <Input id={id} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />}
        </Field>
        <Field label="Apellidos" error={errors.last_name}>
          {(id) => <Input id={id} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />}
        </Field>
        <Field label="Correo" error={errors.email}>
          {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
        </Field>
        <Field label="Rol" error={errors.role}>
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              <option value="admin">Admin de juego</option>
              <option value="superadmin">Superadministrador</option>
            </Select>
          )}
        </Field>
        {form.role === 'admin' && (
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium text-ink-300">Juegos que gestionará</p>
            <GamePicker value={form.game_ids} onChange={(ids) => set('game_ids', ids)} />
          </div>
        )}
      </form>
    </Modal>
  )
}

function AssignGames({ admin, onClose }: { admin: AdminUser; onClose: () => void }) {
  const [ids, setIds] = useState(admin.games.map((g) => g.id))
  const save = useApiMutation({
    request: () => api(`admin/${admin.id}/games/`, { method: 'PUT', body: { game_ids: ids } }),
    invalidate: [['admins'], ['me']],
    success: 'Juegos asignados',
    onSuccess: onClose,
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Juegos de ${admin.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <GamePicker value={ids} onChange={setIds} />
    </Modal>
  )
}

function ResetPassword({ admin, onClose }: { admin: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const save = useApiMutation({
    request: () => api(`admin/${admin.id}/reset-password/`, { method: 'POST', body: { new_password: password } }),
    success: 'Contraseña actualizada',
    onSuccess: onClose,
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nueva contraseña para ${admin.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!password} onClick={() => save.mutate()}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <Field label="Contraseña nueva" error={save.error?.fields.new_password}>
        {(id) => (
          <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        )}
      </Field>
    </Modal>
  )
}
