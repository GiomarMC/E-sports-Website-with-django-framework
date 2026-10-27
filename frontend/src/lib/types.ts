// Types of the Django REST API (esports/serializers.py).

export type GameType = 'individual' | 'team'
export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed' | 'canceled'
export type RegistrationStatus = 'pending' | 'confirmed' | 'rejected'
export type StageType = 'round_robin' | 'single_elimination' | 'double_elimination' | 'free_for_all' | 'manual'
export type BracketSide = 'upper' | 'lower' | 'final'
export type StageStatus = 'pending' | 'ongoing' | 'completed'
export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'canceled'
export type Platform = 'twitch' | 'youtube' | 'facebook' | 'kick' | 'tiktok' | 'other'
export type Role = 'admin' | 'superadmin'
export type PaymentMethodType = 'yape' | 'plin' | 'bank_transfer' | 'other'
export type ContactKind = 'whatsapp' | 'whatsapp_group' | 'phone' | 'email' | 'link'

export interface TournamentSummary {
  id: number
  name: string
  status: TournamentStatus
}

export interface Game {
  id: number
  name: string
  description: string
  type_of_game: GameType
  min_players: number
  max_players: number
  rules: string
  active: boolean
  images: string | null
  bases: string | null
  tournaments: TournamentSummary[]
}

/** Where the registration of the tournaments of a game is paid. */
export interface PaymentMethod {
  id: number
  game: number
  method: PaymentMethodType
  method_display: string
  holder_name: string
  phone_number: string
  bank_name: string
  account_number: string
  /** Interbank account code (bank transfers). */
  cci: string
  qr_image: string | null
  instructions: string
  active: boolean
  order: number
}

export interface StageSummary {
  id: number
  name: string
  order: number
  stage_type: StageType
  status: StageStatus
}

export interface RegistrationWindow {
  is_open: boolean
  reason: string
  starts_at: string | null
  ends_at: string | null
  registered: number
}

export interface Tournament {
  id: number
  game: number
  game_name: string
  type_of_game: GameType
  min_players: number
  max_players: number
  name: string
  description: string
  start_date: string
  end_date: string | null
  status: TournamentStatus
  fee_per_player: string
  currency: string
  registration_enabled: boolean
  registration_start: string | null
  registration_end: string | null
  max_registrations: number | null
  registration: RegistrationWindow
  stages: StageSummary[]
}

export interface PublicMember {
  nickname: string
  is_captain: boolean
}

export interface PublicRegistration {
  id: number
  display_name: string
  team_name: string
  logo: string | null
  seed: number | null
  members: PublicMember[]
}

export interface Member {
  id?: number
  full_name: string
  student_code: string
  nickname: string
  game_account_id: string
  email: string
  phone: string
  /** Comes from another university (``university`` says which one). */
  is_external: boolean
  university: string
  is_captain: boolean
}

export interface Registration {
  id: number
  tournament: number
  tournament_name: string
  display_name: string
  team_name: string
  logo: string | null
  /** Signed link that expires after an hour (the file is private). */
  voucher: string | null
  voucher_is_pdf: boolean
  contact_email: string
  contact_phone: string
  amount_due: string
  status: RegistrationStatus
  rejection_reason: string
  is_active: boolean
  seed: number | null
  code: string
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  members: Member[]
}

export interface RegistrationStatusInfo {
  code: string
  tournament: number
  tournament_name: string
  display_name: string
  amount_due: string
  status: RegistrationStatus
  rejection_reason: string
  created_at: string
  members: PublicMember[]
}

/** Public search result: only public data (no code, no contact data). */
export interface RegistrationLookupItem extends Omit<RegistrationStatusInfo, 'code'> {
  id: number
  game_name: string
}

export interface RegistrationLookup {
  results: RegistrationLookupItem[]
  /** More registrations matched than the ones returned. */
  truncated: boolean
}

export interface RegisterResponse {
  message: string
  code: string
  amount_due: string
  status: RegistrationStatus
  /** Groups or clans to join, shown only after registering. */
  join_links: OrganizerContact[]
}

export interface Quote {
  players: number
  fee_per_player: string
  total: string
  currency: string
}

export interface Stage extends StageSummary {
  tournament: number
  best_of: number
  final_best_of: number | null
  /** Double elimination: best of of the lower bracket (null = best_of). */
  lower_best_of: number | null
  number_of_groups: number
  advance_per_group: number
  /** Next places of each group that start in the lower bracket. */
  lower_advance_per_group: number
  round_robin_legs: number
  ffa_rounds: number
  third_place_match: boolean
  points_win: number
  points_draw: number
  points_loss: number
}

export interface StageGroup {
  id: number
  name: string
  order: number
  participants: PublicRegistration[]
}

export interface StageDetail extends Stage {
  groups: StageGroup[]
  participants: PublicRegistration[]
}

export interface DrawResult extends StageDetail {
  /** Registrations in seed order (send them back to keep a preview). */
  seeding: number[]
  /** Double elimination: teams that start in the lower bracket. */
  lower_seeding: number[]
  bracket: BracketSection[]
  preview: boolean
}

export interface MatchParticipant {
  id: number
  slot: number
  registration: number | null
  registration_name: string | null
  logo: string | null
  score: number
  placement: number | null
}

export interface Stream {
  id: number
  title: string
  platform: Platform
  url: string
  game: number | null
  match: number | null
  is_live: boolean
  created_at: string
}

export interface Match {
  id: number
  tournament: number
  game: number
  stage: number
  stage_name: string
  group: number | null
  group_name: string | null
  bracket: BracketSide | ''
  round: number
  position: number
  label: string
  scheduled_at: string | null
  best_of: number
  status: MatchStatus
  is_bye: boolean
  winner: number | null
  next_match: number | null
  next_match_slot: number | null
  loser_next_match: number | null
  loser_next_match_slot: number | null
  notes: string
  /** True when the match can end in a tie (league with an even best of). */
  can_draw: boolean
  participants: MatchParticipant[]
  streams: Stream[]
  updated_at: string
}

export interface BracketSection {
  group: string | null
  bracket: BracketSide | null
  rounds: { round: number; matches: Match[] }[]
}

export interface StandingRow {
  rank: number
  registration: PublicRegistration
  played: number
  wins: number
  draws: number
  losses: number
  score_for: number
  score_against: number
  score_diff: number
  points: number
  best_placement?: number | null
}

export interface GroupStandings {
  group: string | null
  group_id: number | null
  standings: StandingRow[]
}

export interface SiteSettings {
  event_name: string
  registration_enabled: boolean
  main_stream_url: string
  currency: string
}

export interface AdminUser {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  nickname: string
  phone: string
  role: Role
  games: { id: number; name: string }[]
}

export interface MediaContent {
  id: number
  title: string
  file: string
  type: 'image' | 'video'
  uploaded_at: string
}

/** Organizer contact: general (tournament null) or of a tournament. */
export interface OrganizerContact {
  id: number
  tournament: number | null
  kind: ContactKind
  kind_display: string
  name: string
  role: string
  value: string
  /** wa.me, tel:, mailto: or the link itself. */
  link: string
  active: boolean
  /** Hidden in the site: shown only when the registration form is sent. */
  registered_only: boolean
  order: number
}

export type WebhookEvent = 'match.scheduled' | 'match.started' | 'stream.live' | 'match.result'

export interface Webhook {
  id: number
  name: string
  url: string
  /** Shared with the receiver to check the signature. */
  secret: string
  /** Empty: every event. */
  events: WebhookEvent[]
  active: boolean
  last_delivery_at: string | null
  last_status: string
  created_at: string
}

export interface ContactInfo {
  id: number
  platform: string
  link: string
}
