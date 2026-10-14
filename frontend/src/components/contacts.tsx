import { ArrowSquareOut, EnvelopeSimple, LinkSimple, Phone, UsersThree, WhatsappLogo } from '@phosphor-icons/react'
import { contactValue } from '../lib/format'
import { useOrganizerContacts } from '../lib/queries'
import type { ContactKind, OrganizerContact } from '../lib/types'
import { cx, Skeleton } from './ui'

const ICONS: Record<ContactKind, typeof Phone> = {
  whatsapp: WhatsappLogo,
  whatsapp_group: UsersThree,
  phone: Phone,
  email: EnvelopeSimple,
  link: LinkSimple,
}

const ACTIONS: Record<ContactKind, string> = {
  whatsapp: 'Escribir',
  whatsapp_group: 'Unirse',
  phone: 'Llamar',
  email: 'Escribir',
  link: 'Abrir',
}

const external = (contact: OrganizerContact) => /^https?:/.test(contact.link)

/** One row per contact with a button that opens the chat, call or email. */
export function ContactList({ contacts, className }: { contacts: OrganizerContact[]; className?: string }) {
  return (
    <ul className={cx('space-y-2', className)}>
      {contacts.map((contact) => {
        const Icon = ICONS[contact.kind]
        const whatsapp = contact.kind === 'whatsapp' || contact.kind === 'whatsapp_group'
        return (
          <li key={contact.id}>
            <a
              href={contact.link}
              target={external(contact) ? '_blank' : undefined}
              rel={external(contact) ? 'noreferrer' : undefined}
              className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-ink-850 px-3 py-2.5 transition hover:border-white/15 active:scale-[0.99]"
            >
              <span
                className={cx(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  whatsapp ? 'bg-win-soft text-win' : 'bg-ink-700 text-ink-100',
                )}
              >
                <Icon size={18} weight={whatsapp ? 'fill' : 'regular'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-100">{contact.name}</span>
                <span className="block truncate text-xs text-ink-400">
                  {contact.role ? `${contact.role} · ` : ''}
                  <span className={cx((contact.kind === 'whatsapp' || contact.kind === 'phone') && 'font-mono')}>
                    {contactValue(contact)}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-300 transition group-hover:text-ink-100">
                {ACTIONS[contact.kind]}
                {external(contact) && <ArrowSquareOut size={12} />}
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/** Contacts of a tournament; while it has none, the general contacts of
 * the event so the player always has someone to write to. */
export function TournamentContacts({
  tournamentId,
  title = 'Contacto con los organizadores',
  className,
}: {
  tournamentId: number
  title?: string
  className?: string
}) {
  const own = useOrganizerContacts({ tournament: tournamentId })
  const general = useOrganizerContacts({ general: true }, own.isSuccess && own.data.length === 0)
  if (own.isPending) return <Skeleton className={cx('h-24', className)} />
  const contacts = own.data?.length ? own.data : (general.data ?? [])
  if (!contacts.length) return null
  // The WhatsApp group goes first: it is the main channel of a tournament.
  const sorted = [...contacts].sort((a, b) => Number(b.kind === 'whatsapp_group') - Number(a.kind === 'whatsapp_group'))
  return (
    <section className={className}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">{title}</h3>
      <ContactList contacts={sorted} />
    </section>
  )
}
