import { Link as LinkIcon, Plus, Trash } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Button, ErrorState, Field, Input, Skeleton, Toggle } from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { api } from '../../lib/api'
import { fromInputDateTime, toInputDateTime } from '../../lib/format'
import { useApiMutation, useContacts, useSettings } from '../../lib/queries'
import type { SiteSettings } from '../../lib/types'
import { OrganizerContactsPanel } from './OrganizerContacts'

export default function SettingsPage() {
  const settings = useSettings()
  if (settings.isPending) return <Skeleton className="h-96" />
  if (settings.isError) return <ErrorState message={settings.error.message} />
  return <SettingsForm settings={settings.data} />
}

function SettingsForm({ settings }: { settings: SiteSettings }) {
  const [form, setForm] = useState({
    event_name: settings.event_name,
    registration_enabled: settings.registration_enabled,
    registration_start: toInputDateTime(settings.registration_start),
    registration_end: toInputDateTime(settings.registration_end),
    main_stream_url: settings.main_stream_url,
  })

  const save = useApiMutation({
    request: () =>
      api('settings/', {
        method: 'PATCH',
        body: {
          ...form,
          registration_start: fromInputDateTime(form.registration_start),
          registration_end: fromInputDateTime(form.registration_end),
        },
      }),
    invalidate: [['settings'], ['tournaments'], ['tournament']],
    success: 'Configuración guardada',
  })
  const errors = save.error?.fields ?? {}
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <>
      <PageHeader title="Configuración" description="Ajustes generales del evento. Afectan a todos los juegos." />
      <form onSubmit={submit} className="space-y-6">
        <section className="surface space-y-5 p-6">
          <h2 className="font-display text-lg font-semibold">Evento</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nombre del evento" error={errors.event_name}>
              {(id) => <Input id={id} value={form.event_name} onChange={(e) => set('event_name', e.target.value)} />}
            </Field>
            <Field label="Canal oficial de stream" error={errors.main_stream_url} hint="Se muestra en la página En vivo.">
              {(id) => (
                <Input
                  id={id}
                  value={form.main_stream_url}
                  onChange={(e) => set('main_stream_url', e.target.value)}
                  placeholder="https://twitch.tv/..."
                />
              )}
            </Field>
          </div>
        </section>

        <section className="surface space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Inscripciones de todos los juegos</h2>
              <p className="text-sm text-ink-400">
                Interruptor general y fechas por defecto. Cada torneo puede tener sus propias fechas.
              </p>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-2.5">
              <Toggle
                checked={form.registration_enabled}
                onChange={(v) => set('registration_enabled', v)}
                label="Inscripciones habilitadas"
              />
              <span className="text-sm font-medium">{form.registration_enabled ? 'Habilitadas' : 'Deshabilitadas'}</span>
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Inicio de inscripciones" error={errors.registration_start}>
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={form.registration_start}
                  onChange={(e) => set('registration_start', e.target.value)}
                />
              )}
            </Field>
            <Field label="Fin de inscripciones" error={errors.registration_end}>
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={form.registration_end}
                  onChange={(e) => set('registration_end', e.target.value)}
                />
              )}
            </Field>
          </div>
        </section>
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={save.isPending}>
            Guardar configuración
          </Button>
        </div>
      </form>

      <div className="mt-10">
        <OrganizerContactsPanel
          tournamentId={null}
          title="Contacto de la organización"
          description="WhatsApp, grupo, teléfono o correo generales del evento. Se muestran en el pie de página y en los torneos que no tienen contactos propios."
        />
      </div>

      <Contacts />
    </>
  )
}

function Contacts() {
  const contacts = useContacts()
  const [platform, setPlatform] = useState('')
  const [link, setLink] = useState('')
  const add = useApiMutation({
    request: () => api('contacts/', { method: 'POST', body: { platform, link } }),
    invalidate: [['contacts']],
    success: 'Contacto agregado',
    onSuccess: () => {
      setPlatform('')
      setLink('')
    },
  })
  const remove = useApiMutation({
    request: (id: number) => api(`contacts/${id}/`, { method: 'DELETE' }),
    invalidate: [['contacts']],
    success: 'Contacto eliminado',
  })
  return (
    <section className="surface mt-6 space-y-5 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Redes sociales</h2>
        <p className="text-sm text-ink-400">Aparecen en el pie de página del sitio.</p>
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {(contacts.data ?? []).map((contact) => (
          <li key={contact.id} className="flex items-center gap-3 py-2.5 text-sm">
            <LinkIcon size={16} className="text-ink-400" />
            <span className="font-medium">{contact.platform}</span>
            <span className="min-w-0 flex-1 truncate text-ink-400">{contact.link}</span>
            <button
              onClick={() => remove.mutate(contact.id)}
              className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-accent-soft hover:text-accent"
              aria-label={`Eliminar ${contact.platform}`}
            >
              <Trash size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate()
        }}
        className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end"
      >
        <Field label="Red" error={add.error?.fields.platform}>
          {(id) => <Input id={id} value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Instagram" />}
        </Field>
        <Field label="Link" error={add.error?.fields.link}>
          {(id) => <Input id={id} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />}
        </Field>
        <Button type="submit" icon={<Plus size={16} />} loading={add.isPending} disabled={!platform || !link} className="h-11">
          Agregar
        </Button>
      </form>
    </section>
  )
}
