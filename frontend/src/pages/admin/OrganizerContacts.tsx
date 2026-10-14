import { AddressBook, EnvelopeSimple, LinkSimple, PencilSimple, Phone, Plus, Trash, UsersThree, WhatsappLogo } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Toggle } from '../../components/ui'
import { api } from '../../lib/api'
import { contactKindLabel, contactValue } from '../../lib/format'
import { useApiMutation, useOrganizerContacts } from '../../lib/queries'
import type { ContactKind, OrganizerContact } from '../../lib/types'

const ICONS: Record<ContactKind, typeof Phone> = {
  whatsapp: WhatsappLogo,
  whatsapp_group: UsersThree,
  phone: Phone,
  email: EnvelopeSimple,
  link: LinkSimple,
}

const VALUE_FIELD: Record<ContactKind, { label: string; placeholder: string; hint?: string }> = {
  whatsapp: { label: 'Número de WhatsApp', placeholder: '987 654 321', hint: '9 dígitos, o con +código si es de otro país.' },
  whatsapp_group: {
    label: 'Link del grupo',
    placeholder: 'https://chat.whatsapp.com/...',
    hint: 'En WhatsApp: Info del grupo → Invitar mediante enlace.',
  },
  phone: { label: 'Número', placeholder: '987 654 321' },
  email: { label: 'Correo', placeholder: 'organizacion@unsa.edu.pe' },
  link: { label: 'Link', placeholder: 'https://', hint: 'Clan del juego, servidor de Discord, etc.' },
}

/** Contacts of the organizers. ``tournamentId`` null = general contacts of
 * the event (footer and tournaments without their own contacts). */
export function OrganizerContactsPanel({
  tournamentId,
  title,
  description,
}: {
  tournamentId: number | null
  title: string
  description: string
}) {
  const params = tournamentId ? { tournament: tournamentId } : { general: true }
  const contacts = useOrganizerContacts(params)
  const [editing, setEditing] = useState<OrganizerContact | 'new' | null>(null)
  const [deleting, setDeleting] = useState<OrganizerContact | null>(null)
  const toggle = useApiMutation({
    request: (contact: OrganizerContact) =>
      api(`organizer-contacts/${contact.id}/`, { method: 'PATCH', body: { active: !contact.active } }),
    invalidate: [['organizer-contacts']],
    success: 'Contacto actualizado',
  })
  const remove = useApiMutation({
    request: (contact: OrganizerContact) => api(`organizer-contacts/${contact.id}/`, { method: 'DELETE' }),
    invalidate: [['organizer-contacts']],
    success: 'Contacto eliminado',
    onSuccess: () => setDeleting(null),
  })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="max-w-[70ch] text-sm text-ink-400">{description}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
          Agregar contacto
        </Button>
      </div>

      {contacts.isPending ? (
        <Skeleton className="h-32" />
      ) : contacts.isError ? (
        <ErrorState message={contacts.error.message} onRetry={() => contacts.refetch()} />
      ) : contacts.data.length === 0 ? (
        <EmptyState
          icon={<AddressBook size={24} />}
          title="Sin contactos"
          description="Agrega el WhatsApp de un organizador o el link del grupo para que los jugadores puedan comunicarse."
          action={<Button onClick={() => setEditing('new')}>Agregar contacto</Button>}
        />
      ) : (
        <div className="surface divide-y divide-white/[0.05]">
          {contacts.data.map((contact) => {
            const Icon = ICONS[contact.kind]
            return (
              <div key={contact.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <span className="grid size-10 place-items-center rounded-xl bg-ink-800 text-ink-100">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{contact.name}</p>
                    <Badge>{contact.kind_display}</Badge>
                    {contact.registered_only && <Badge>Solo inscritos</Badge>}
                    {!contact.active && <Badge>Oculto</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-300">
                    {contact.role && `${contact.role} · `}
                    <a href={contact.link} target="_blank" rel="noreferrer" className="font-mono hover:text-ink-100">
                      {contact.kind === 'whatsapp_group' ? contact.value : contactValue(contact)}
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
                    <Toggle checked={contact.active} onChange={() => toggle.mutate(contact)} label="Visible" />
                    Visible
                  </label>
                  <Button variant="secondary" size="sm" icon={<PencilSimple size={14} />} onClick={() => setEditing(contact)}>
                    Editar
                  </Button>
                  <button
                    onClick={() => setDeleting(contact)}
                    className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-accent-soft hover:text-accent"
                    aria-label="Eliminar contacto"
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
        <ContactForm
          tournamentId={tournamentId}
          contact={editing === 'new' ? null : editing}
          order={contacts.data?.length ?? 0}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar contacto"
        description={`Se quitará “${deleting?.name}” del sitio.`}
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </section>
  )
}

function ContactForm({
  tournamentId,
  contact,
  order,
  onClose,
}: {
  tournamentId: number | null
  contact: OrganizerContact | null
  order: number
  onClose: () => void
}) {
  const [form, setForm] = useState({
    kind: (contact?.kind ?? 'whatsapp') as ContactKind,
    name: contact?.name ?? '',
    role: contact?.role ?? '',
    value: contact?.value ?? '',
    active: contact?.active ?? true,
    registered_only: contact?.registered_only ?? false,
  })
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))
  const field = VALUE_FIELD[form.kind]

  const save = useApiMutation({
    request: () =>
      contact
        ? api(`organizer-contacts/${contact.id}/`, { method: 'PATCH', body: form })
        : api('organizer-contacts/', { method: 'POST', body: { ...form, tournament: tournamentId, order } }),
    invalidate: [['organizer-contacts']],
    success: 'Contacto guardado',
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
      title={contact ? 'Editar contacto' : 'Agregar contacto'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="contact-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Tipo" error={errors.kind}>
            {(id) => (
              <Select
                id={id}
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as ContactKind
                  setForm((f) => ({ ...f, kind, name: !f.name && kind === 'whatsapp_group' ? 'Grupo del torneo' : f.name }))
                }}
              >
                {Object.entries(contactKindLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Nombre" error={errors.name} hint="Ej. Renzo Mamani o Grupo del torneo.">
            {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />}
          </Field>
          <Field label={field.label} error={errors.value} hint={field.hint} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                type={form.kind === 'email' ? 'email' : form.kind === 'whatsapp' || form.kind === 'phone' ? 'tel' : 'url'}
                value={form.value}
                onChange={(e) => set('value', e.target.value)}
                placeholder={field.placeholder}
                className="font-mono"
                maxLength={255}
              />
            )}
          </Field>
          <Field label="Cargo (opcional)" error={errors.role} hint="Ej. Organizador, Admin de Dota 2, Árbitro." className="sm:col-span-2">
            {(id) => <Input id={id} value={form.role} onChange={(e) => set('role', e.target.value)} maxLength={100} />}
          </Field>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
          <span>
            <span className="block text-sm font-medium">Solo para los inscritos</span>
            <span className="block text-xs text-ink-400">
              No aparece en el sitio: se muestra al terminar el formulario de inscripción (grupo de WhatsApp, clan, Discord).
            </span>
          </span>
          <Toggle checked={form.registered_only} onChange={(v) => set('registered_only', v)} label="Solo para los inscritos" />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
          <span className="text-sm font-medium">{form.registered_only ? 'Activo' : 'Visible en el sitio'}</span>
          <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Visible" />
        </label>
        {errors.detail && <p className="text-sm text-accent">{errors.detail}</p>}
      </form>
    </Modal>
  )
}
