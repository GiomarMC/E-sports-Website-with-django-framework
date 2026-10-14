import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Field, PasswordInput } from '../../components/ui'
import { PageHeader } from '../../layouts/AdminLayout'
import { api } from '../../lib/api'
import { useApiMutation } from '../../lib/queries'

export default function AccountPage() {
  const { user } = useAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat !== '' && repeat !== newPassword

  const save = useApiMutation({
    request: () =>
      api('admin/change-password/', {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword },
      }),
    success: 'Contraseña actualizada',
    onSuccess: () => {
      setOldPassword('')
      setNewPassword('')
      setRepeat('')
    },
  })
  const errors = save.error?.fields ?? {}

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!mismatch) save.mutate()
  }

  return (
    <>
      <PageHeader title="Mi cuenta" description={`Sesión iniciada como ${user?.username}.`} />
      <form onSubmit={submit} className="surface max-w-lg space-y-5 p-6">
        <h2 className="font-display text-lg font-semibold">Cambiar contraseña</h2>
        <Field label="Contraseña actual" error={errors.old_password}>
          {(id) => (
            <PasswordInput
              id={id}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Field label="Contraseña nueva" error={errors.new_password}>
          {(id) => (
            <PasswordInput
              id={id}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Field label="Repite la contraseña nueva" error={mismatch ? 'No coincide.' : undefined}>
          {(id) => (
            <PasswordInput
              id={id}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              invalid={mismatch}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Button type="submit" loading={save.isPending} disabled={!oldPassword || !newPassword || mismatch}>
          Actualizar contraseña
        </Button>
      </form>
    </>
  )
}
