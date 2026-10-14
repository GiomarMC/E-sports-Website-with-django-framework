import {
  ArrowSquareOut,
  Broadcast,
  CalendarBlank,
  GameController,
  List,
  MagnifyingGlass,
  ShieldCheck,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ContactList } from '../components/contacts'
import { cx, LiveDot } from '../components/ui'
import { useContacts, useOrganizerContacts, useSettings, useStreams } from '../lib/queries'

const links = [
  { to: '/', label: 'Juegos', icon: GameController, end: true },
  { to: '/cronograma', label: 'Cronograma', icon: CalendarBlank },
  { to: '/en-vivo', label: 'En vivo', icon: Broadcast },
  { to: '/inscripcion/estado', label: 'Mi inscripción', icon: MagnifyingGlass },
]

export function Logo({ name }: { name?: string }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-ink-800" />
        <path d="M9 22 16 8l7 14h-4.2L16 16l-2.8 6z" className="fill-accent" />
      </svg>
      <span className="truncate whitespace-nowrap font-display text-lg font-bold uppercase tracking-wide">{name || 'Esports'}</span>
    </Link>
  )
}

export default function PublicLayout() {
  const { data: settings } = useSettings()
  const { data: live } = useStreams({ live: true })
  const { user } = useAuth()
  const location = useLocation()
  // The mobile menu stays open only on the page where it was opened.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const hasLive = (live?.length ?? 0) > 0

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 md:px-8">
          <Logo name={settings?.event_name} />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {links.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'relative flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition',
                    isActive ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {to === '/en-vivo' && hasLive && <LiveDot />}
                    {label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user && (
              <Link
                to="/admin"
                className="hidden h-9 items-center gap-2 rounded-lg bg-ink-800 px-3 text-sm font-medium text-ink-100 transition hover:bg-ink-700 sm:flex"
              >
                <ShieldCheck size={16} weight="fill" className="text-accent" /> Panel admin
              </Link>
            )}
            <button
              className="grid size-10 place-items-center rounded-lg text-ink-300 hover:bg-white/5 md:hidden"
              onClick={() => setOpenOn(open ? null : location.pathname)}
              aria-label="Menú"
            >
              {open ? <X size={22} /> : <List size={22} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="border-t border-white/[0.06] px-4 py-3 md:hidden"
            >
              {[...links, ...(user ? [{ to: '/admin', label: 'Panel admin', icon: ShieldCheck, end: false }] : [])].map(
                ({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cx(
                        'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
                        isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-300',
                      )
                    }
                  >
                    <Icon size={18} /> {label}
                    {to === '/en-vivo' && hasLive && <LiveDot />}
                  </NavLink>
                ),
              )}
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer eventName={settings?.event_name} />
    </div>
  )
}

function Footer({ eventName }: { eventName?: string }) {
  const { data: contacts } = useContacts()
  const { data: organizers } = useOrganizerContacts({ general: true })
  return (
    <footer className="mt-24 border-t border-white/[0.06]">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div>
          <Logo name={eventName} />
          <p className="mt-4 max-w-[45ch] text-sm leading-relaxed text-ink-400">
            Torneos de esports de la escuela. Inscripciones, cronograma, resultados y transmisiones en un solo lugar.
          </p>
          {!!organizers?.length && (
            <div className="mt-6 max-w-sm">
              <p className="mb-3 text-sm font-semibold">Habla con la organización</p>
              <ContactList contacts={organizers} />
            </div>
          )}
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Torneo</p>
          <ul className="space-y-2 text-sm text-ink-400">
            {links.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="transition hover:text-ink-100">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Contacto</p>
          <ul className="space-y-2 text-sm text-ink-400">
            {(contacts ?? []).map((contact) => (
              <li key={contact.id}>
                <a
                  href={contact.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 transition hover:text-ink-100"
                >
                  {contact.platform} <ArrowSquareOut size={12} />
                </a>
              </li>
            ))}
            {contacts?.length === 0 && <li>Pronto</li>}
            <li>
              <Link to="/admin" className="transition hover:text-ink-100">
                Acceso administradores
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
