import { Link } from 'react-router-dom'
import { Button } from '../../components/ui'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-6 px-4 py-24 md:px-8">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="font-display text-5xl font-bold uppercase tracking-tight">Fuera del mapa</h1>
      <p className="max-w-[50ch] text-ink-400">La página que buscas no existe o fue movida.</p>
      <Link to="/">
        <Button>Volver al inicio</Button>
      </Link>
    </div>
  )
}
