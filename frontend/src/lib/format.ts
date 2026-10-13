import type {
  MatchStatus,
  Platform,
  RegistrationStatus,
  StageStatus,
  StageType,
  TournamentStatus,
} from './types'

const LOCALE = 'es-PE'

export function formatMoney(amount: string | number, currency = 'PEN') {
  const value = typeof amount === 'string' ? Number(amount) : amount
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(value)
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return 'Por definir'
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: withTime ? undefined : 'numeric',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(new Date(value))
}

export function formatTime(value: string | null | undefined) {
  if (!value) return '--:--'
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(value),
  )
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(value),
  )
}

/** ISO string -> value for <input type="datetime-local"> (local time). */
export function toInputDateTime(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** <input type="datetime-local"> value -> ISO string (or null when empty). */
export function fromInputDateTime(value: string) {
  return value ? new Date(value).toISOString() : null
}

export const tournamentStatusLabel: Record<TournamentStatus, string> = {
  upcoming: 'Próximo',
  ongoing: 'En curso',
  completed: 'Finalizado',
  canceled: 'Cancelado',
}

export const registrationStatusLabel: Record<RegistrationStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
}

export const stageTypeLabel: Record<StageType, string> = {
  round_robin: 'Liga / grupos (1 vs 1)',
  single_elimination: 'Eliminación directa',
  double_elimination: 'Doble eliminación (upper y lower)',
  free_for_all: 'Todos a la vez (por puntos)',
  manual: 'Manual',
}

export const stageStatusLabel: Record<StageStatus, string> = {
  pending: 'Por jugar',
  ongoing: 'En juego',
  completed: 'Terminada',
}

export const matchStatusLabel: Record<MatchStatus, string> = {
  scheduled: 'Programado',
  live: 'En vivo',
  completed: 'Finalizado',
  canceled: 'Cancelado',
}

export const platformLabel: Record<Platform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  facebook: 'Facebook',
  kick: 'Kick',
  tiktok: 'TikTok',
  other: 'Otro',
}

export function playersLabel(min: number, max: number) {
  if (max === 1) return '1 jugador'
  return min === max ? `${min} jugadores` : `${min} a ${max} jugadores`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}
