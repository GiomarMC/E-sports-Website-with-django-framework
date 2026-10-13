import {
  Broadcast,
  ClipboardText,
  GameController,
  Gear,
  House,
  List,
  SignOut,
  Trophy,
  UserCircle,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ComponentType, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { cx, Skeleton } from '../components/ui'
import { useRegistrations, useSettings } from '../lib/queries'
import { AdminScope } from '../lib/scope'
import { Logo } from './PublicLayout'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone' }>
  superadmin?: boolean
  badge?: number
}

export default function AdminLayout() {
  const { user, loading, logout, isSuperadmin } = useAuth()
  const location = useLocation()
  // The mobile drawer stays open only on the page where it was opened.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const setOpen = (value: boolean) => setOpenOn(value ? location.pathname : null)
  const pending = useRegistrations({ status: 'pending' }, !!user)
  const { data: settings } = useSettings()

  if (loading) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-10">
        <Skeleton className="h-10" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />

  const items: NavItem[] = [
    { to: '/admin', label: 'Inicio', icon: House },
    { to: '/admin/inscripciones', label: 'Inscripciones', icon: ClipboardText, badge: pending.data?.length },
    { to: '/admin/torneos', label: 'Torneos y matchs', icon: Trophy },
    { to: '/admin/juegos', label: 'Juegos', icon: GameController },
    { to: '/admin/streams', label: 'Streams', icon: Broadcast },
    { to: '/admin/administradores', label: 'Administradores', icon: UsersThree, superadmin: true },
    { to: '/admin/configuracion', label: 'Configuración', icon: Gear, superadmin: true },
  ]

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {items
        .filter((item) => !item.superadmin || isSuperadmin)
        .map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            className={({ isActive }) =>
              cx(
                'group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                isActive ? 'text-ink-100' : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="admin-nav"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-ink-800"
                  />
                )}
                <span className="relative flex flex-1 items-center gap-3">
                  <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                  {label}
                </span>
                {!!badge && (
                  <span className="relative rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
    </nav>
  )

  const footer = (
    <div className="space-y-1 border-t border-white/[0.06] pt-4">
      <Link
        to="/admin/cuenta"
        className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/[0.04]"
      >
        <UserCircle size={32} weight="duotone" className="text-ink-400" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{user.username}</span>
          <span className="block text-xs text-ink-400">
            {isSuperadmin ? 'Superadministrador' : `Admin de ${user.games.map((g) => g.name).join(', ') || 'ningún juego'}`}
          </span>
        </span>
      </Link>
      <button
        onClick={logout}
        className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-400 transition hover:bg-white/[0.04] hover:text-ink-100"
      >
        <SignOut size={18} /> Cerrar sesión
      </button>
    </div>
  )

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[288px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-6 border-r border-white/[0.06] bg-ink-900 p-4 lg:flex">
        <div className="flex items-center justify-between px-2 pt-2">
          <Logo name={settings?.event_name} />
          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            Admin
          </span>
        </div>
        {nav}
        <Link to="/" className="px-3 text-xs text-ink-400 transition hover:text-ink-100">
          Ver sitio público
        </Link>
        {footer}
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.06] bg-ink-900/90 px-4 backdrop-blur-xl lg:hidden">
        <Logo name={settings?.event_name} />
        <button
          className="grid size-10 place-items-center rounded-lg text-ink-300 hover:bg-white/5"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
        >
          <List size={22} />
        </button>
      </header>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink-950/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-ink-900 p-4"
            >
              <div className="flex items-center justify-between px-2 pt-2">
                <Logo name={settings?.event_name} />
                <button onClick={() => setOpen(false)} aria-label="Cerrar menú" className="text-ink-400">
                  <X size={22} />
                </button>
              </div>
              {nav}
              {footer}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="min-w-0 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">
          <AdminScope>
            <Outlet />
          </AdminScope>
        </div>
      </main>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-[65ch] text-sm text-ink-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
