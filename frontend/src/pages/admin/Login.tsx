import { ShieldCheck } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Field, Input, PasswordInput } from '../../components/ui'
import { Logo } from '../../layouts/PublicLayout'
import type { ApiError } from '../../lib/api'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  if (user) return <Navigate to={from} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      const apiError = err as ApiError
      setError(apiError.status === 401 ? 'Usuario o contraseña incorrectos.' : apiError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grain grid min-h-[100dvh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-white/[0.06] bg-ink-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--color-accent-soft),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            <p className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight">
              Panel de
              <br />
              administración
            </p>
            <p className="mt-4 max-w-[40ch] text-ink-400">
              Revisa inscripciones, haz el sorteo, programa los matchs y define a los ganadores.
            </p>
          </div>
          <Link to="/" className="text-sm text-ink-400 hover:text-ink-100">
            Volver al sitio
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 140, damping: 20 }}
          className="w-full max-w-sm space-y-6"
        >
          <div>
            <div className="mb-4 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent">
              <ShieldCheck size={26} weight="fill" />
            </div>
            <h1 className="font-display text-3xl font-semibold">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-ink-400">Solo para administradores del torneo.</p>
          </div>
          <Field label="Usuario">
            {(id) => (
              <Input id={id} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
            )}
          </Field>
          <Field label="Contraseña">
            {(id) => (
              <PasswordInput
                id={id}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            )}
          </Field>
          {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!username || !password}>
            Entrar
          </Button>
        </motion.form>
      </div>
    </div>
  )
}
