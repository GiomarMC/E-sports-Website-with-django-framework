import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { api, ApiError, type RequestOptions } from './api'
import { useToast } from '../components/Toast'
import { useAdminScope } from './scope'
import type {
  AdminUser,
  BracketSection,
  ContactInfo,
  Game,
  GroupStandings,
  Match,
  OrganizerContact,
  PaymentMethod,
  PublicRegistration,
  Quote,
  Registration,
  RegistrationLookup,
  RegistrationStatusInfo,
  SiteSettings,
  Stage,
  StageDetail,
  Stream,
  Tournament,
  Webhook,
} from './types'

type Params = RequestOptions['params']

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError
  }
}

// Live data (matches, streams) refreshes on its own so results appear
// without reloading the page.
const LIVE = { refetchInterval: 30_000 }

export const keys = {
  settings: ['settings'] as const,
  games: ['games'] as const,
  game: (id: number) => ['games', id] as const,
  tournaments: (params?: Params) => ['tournaments', params ?? {}] as const,
  tournament: (id: number) => ['tournament', id] as const,
  participants: (id: number) => ['tournament', id, 'participants'] as const,
  schedule: (id: number) => ['tournament', id, 'schedule'] as const,
  stages: (tournament: number) => ['stages', tournament] as const,
  stage: (id: number) => ['stage', id] as const,
  standings: (id: number) => ['stage', id, 'standings'] as const,
  bracket: (id: number) => ['stage', id, 'bracket'] as const,
  matches: (params?: Params) => ['matches', params ?? {}] as const,
  streams: (params?: Params) => ['streams', params ?? {}] as const,
  registrations: (params?: Params) => ['registrations', params ?? {}] as const,
  admins: ['admins'] as const,
  me: ['me'] as const,
  contacts: ['contacts'] as const,
  webhooks: ['webhooks'] as const,
  paymentMethods: (game: number) => ['payment-methods', game] as const,
  organizerContacts: (params?: Params) => ['organizer-contacts', params ?? {}] as const,
}

interface QueryConfig {
  params?: Params
  enabled?: boolean
  refetchInterval?: number
  retry?: boolean
}

/** GET query aware of the data scope: the admin panel sends the session
 * token, the public site reads the API as an anonymous visitor. The scope is
 * the last element of the key so invalidating a prefix refreshes both. */
function useApiQuery<T>(key: QueryKey, path: string, config: QueryConfig = {}) {
  const admin = useAdminScope()
  const { params, enabled = true, ...options } = config
  return useQuery({
    queryKey: [...key, admin ? 'admin' : 'public'],
    queryFn: () => api<T>(path, { params, auth: admin }),
    enabled,
    ...options,
  })
}

export const useSettings = () => useApiQuery<SiteSettings>(keys.settings, 'settings/')

export const useGames = () => useApiQuery<Game[]>(keys.games, 'games/')

export const useGame = (id: number) => useApiQuery<Game>(keys.game(id), `games/${id}/`, { enabled: id > 0 })

export const useTournaments = (params?: Params) =>
  useApiQuery<Tournament[]>(keys.tournaments(params), 'tournaments/', { params })

export const useTournament = (id: number) =>
  useApiQuery<Tournament>(keys.tournament(id), `tournaments/${id}/`, { enabled: id > 0 })

export const useParticipants = (id: number) =>
  useApiQuery<PublicRegistration[]>(keys.participants(id), `tournaments/${id}/participants/`, { enabled: id > 0 })

export const useSchedule = (id: number) =>
  useApiQuery<Match[]>(keys.schedule(id), `tournaments/${id}/schedule/`, { enabled: id > 0, ...LIVE })

export const useStages = (tournament: number) =>
  useApiQuery<Stage[]>(keys.stages(tournament), 'stages/', { params: { tournament }, enabled: tournament > 0 })

export const useStage = (id: number) => useApiQuery<StageDetail>(keys.stage(id), `stages/${id}/`, { enabled: id > 0 })

export const useStandings = (id: number) =>
  useApiQuery<GroupStandings[]>(keys.standings(id), `stages/${id}/standings/`, { enabled: id > 0, ...LIVE })

export const useBracket = (id: number) =>
  useApiQuery<BracketSection[]>(keys.bracket(id), `stages/${id}/bracket/`, { enabled: id > 0, ...LIVE })

export const useMatches = (params?: Params) => useApiQuery<Match[]>(keys.matches(params), 'matches/', { params, ...LIVE })

export const useStreams = (params?: Params) => useApiQuery<Stream[]>(keys.streams(params), 'streams/', { params, ...LIVE })

export const usePaymentMethods = (game: number) =>
  useApiQuery<PaymentMethod[]>(keys.paymentMethods(game), 'payment-methods/', { params: { game }, enabled: game > 0 })

/** ``{ tournament: id }`` for a tournament, ``{ general: true }`` for the
 * general contacts of the event. */
export const useOrganizerContacts = (params: Params, enabled = true) =>
  useApiQuery<OrganizerContact[]>(keys.organizerContacts(params), 'organizer-contacts/', { params, enabled })

export const useContacts = () => useApiQuery<ContactInfo[]>(keys.contacts, 'contacts/')

export const useWebhooks = () => useApiQuery<Webhook[]>(keys.webhooks, 'webhooks/')

export const useQuote = (tournament: number, players: number) =>
  useApiQuery<Quote>(['quote', tournament, players], `tournaments/${tournament}/quote/`, {
    params: { players },
    enabled: tournament > 0 && players > 0,
  })

export const useRegistrationStatus = (code: string) =>
  useApiQuery<RegistrationStatusInfo>(['registration-status', code], `registrations/status/${code}/`, {
    enabled: code.length > 0,
    retry: false,
  })

/** Public search of registrations by team name or nickname. */
export const useRegistrationLookup = (term: string) =>
  useApiQuery<RegistrationLookup>(['registration-lookup', term], 'registrations/lookup/', {
    params: { q: term },
    enabled: term.length >= 3,
    retry: false,
  })

// ------------------------------------------------------------- admin
// Only used inside the admin panel (always authenticated).

export const useRegistrations = (params?: Params, enabled = true) =>
  useQuery({
    queryKey: keys.registrations(params),
    queryFn: () => api<Registration[]>('registrations/', { params }),
    enabled,
  })

export const useAdmins = (enabled = true) =>
  useQuery({ queryKey: keys.admins, queryFn: () => api<AdminUser[]>('admin/'), enabled })

interface MutationConfig<TVariables, TResult> {
  request: (variables: TVariables) => Promise<TResult>
  /** Query keys (prefixes) to refresh after success. */
  invalidate?: QueryKey[]
  success?: string | ((result: TResult) => string)
  onSuccess?: (result: TResult) => void
}

/** Mutation with automatic cache refresh and toast feedback. */
export function useApiMutation<TVariables = void, TResult = unknown>(config: MutationConfig<TVariables, TResult>) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation<TResult, ApiError, TVariables>({
    mutationFn: config.request,
    onSuccess: (result) => {
      for (const key of config.invalidate ?? []) queryClient.invalidateQueries({ queryKey: key })
      if (config.success) {
        toast.success(typeof config.success === 'function' ? config.success(result) : config.success)
      }
      config.onSuccess?.(result)
    },
    onError: (error) => toast.error(error.message),
  })
}
