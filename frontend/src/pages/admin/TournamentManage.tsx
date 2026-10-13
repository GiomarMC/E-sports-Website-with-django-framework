import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Broadcast,
  CalendarPlus,
  CheckCircle,
  CircleNotch,
  ClipboardText,
  ListBullets,
  ListNumbers,
  Crown,
  DotsThreeVertical,
  PencilSimple,
  Plus,
  Shuffle,
  Trash,
  TreeStructure,
  Trophy,
  Warning,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { BracketSections, GroupMatches, GroupTable, StatusBadge } from '../../components/tournament'
import { useToast } from '../../components/Toast'
import { hasScore, isPowerOfTwo, roundLabel } from '../../lib/tournament'
import {
  Badge,
  Button,
  ConfirmDialog,
  cx,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Tabs,
  TeamLogo,
  Toggle,
} from '../../components/ui'
import { api } from '../../lib/api'
import {
  formatDate,
  fromInputDateTime,
  stageStatusLabel,
  stageTypeLabel,
  toInputDateTime,
  tournamentStatusLabel,
} from '../../lib/format'
import {
  useApiMutation,
  useBracket,
  useMatches,
  useParticipants,
  useStage,
  useStages,
  useStandings,
  useTournament,
} from '../../lib/queries'
import type { DrawResult, Match, Stage, StageType, Tournament } from '../../lib/types'
import { FormatWizard } from './FormatWizard'
import { RegistrationsPanel } from './Registrations'
import { RegistrationSwitch, TournamentForm } from './Tournaments'

type Tab = 'fases' | 'inscripciones'

export default function TournamentManage() {
  const tournamentId = Number(useParams().tournamentId)
  const tournament = useTournament(tournamentId)
  const { canManage } = useAuth()
  const [tab, setTab] = useState<Tab>('fases')
  const [editing, setEditing] = useState(false)

  if (tournament.isPending) return <Skeleton className="h-96" />
  if (tournament.isError) return <ErrorState message={tournament.error.message} />
  if (!canManage(tournament.data.game)) return <Navigate to="/admin/torneos" replace />
  const t = tournament.data

  return (
    <>
      <Link to="/admin/torneos" className="mb-4 inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100">
        <ArrowLeft size={16} /> Torneos
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t.game_name}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-400">
            <Badge tone={t.status === 'ongoing' ? 'live' : t.status === 'completed' ? 'win' : 'neutral'}>
              {tournamentStatusLabel[t.status]}
            </Badge>
            Inicia {formatDate(t.start_date, true)} · {t.registration.registered} inscritos
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RegistrationSwitch tournament={t} />
          <Button variant="secondary" icon={<PencilSimple size={16} />} onClick={() => setEditing(true)}>
            Editar torneo
          </Button>
          <Link to={`/juegos/${t.game}?torneo=${t.id}`} target="_blank">
            <Button variant="ghost">Ver público</Button>
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <Tabs
          layoutId="manage-tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'fases', label: 'Fases y matchs', icon: <TreeStructure size={16} /> },
            { value: 'inscripciones', label: 'Inscripciones', icon: <ClipboardText size={16} /> },
          ]}
        />
      </div>

      {tab === 'fases' ? <StagesManager tournament={t} /> : <RegistrationsPanel tournamentId={t.id} />}
      {editing && <TournamentForm tournament={t} onClose={() => setEditing(false)} />}
    </>
  )
}

// -------------------------------------------------------------- stages

function StagesManager({ tournament }: { tournament: Tournament }) {
  const stages = useStages(tournament.id)
  const [search, setSearch] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState(false)
  const selectedId = Number(search.get('fase')) || stages.data?.[0]?.id || 0
  const selected = stages.data?.find((s) => s.id === selectedId)

  if (stages.isPending) return <Skeleton className="h-80" />
  const count = stages.data?.length ?? 0
  // A tournament played in a single stage is just its "format": phases
  // (numbered) only make sense when there are several stages.
  const single = count <= 1

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
          {single ? 'Formato' : 'Fases en orden'}
        </p>
        {stages.data?.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setSearch({ fase: String(stage.id) }, { replace: true })}
            className={cx(
              'surface flex w-full items-center gap-3 p-3 text-left transition hover:border-white/15',
              stage.id === selectedId && 'border-accent/50 bg-ink-850',
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-800 font-mono text-sm">
              {single ? <TreeStructure size={16} /> : stage.order}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{stage.name}</span>
              <span className="block truncate text-xs text-ink-400">
                {stage.name === stageTypeLabel[stage.stage_type] ? stageStatusLabel[stage.status] : stageTypeLabel[stage.stage_type]}
              </span>
            </span>
            <span
              className={cx(
                'size-2 rounded-full',
                stage.status === 'completed' ? 'bg-win' : stage.status === 'ongoing' ? 'bg-live' : 'bg-ink-600',
              )}
              title={stageStatusLabel[stage.status]}
            />
          </button>
        ))}
        <Button variant="secondary" className="w-full border-dashed" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          {count === 0 ? 'Definir formato' : 'Agregar otra fase'}
        </Button>
        {count === 1 && (
          <p className="px-1 text-xs leading-relaxed text-ink-400">
            Solo si el torneo tiene varias etapas, por ejemplo grupos y luego playoffs.
          </p>
        )}
      </div>

      <div className="min-w-0">
        {selected ? (
          <StagePanel
            key={selected.id}
            stage={selected}
            tournament={tournament}
            next={stages.data?.find((s) => s.order > selected.order) ?? null}
            previous={[...(stages.data ?? [])].reverse().find((s) => s.order < selected.order) ?? null}
            onCreatedNext={(created) => setSearch({ fase: String(created.id) }, { replace: true })}
          />
        ) : (
          <EmptyState
            icon={<TreeStructure size={24} />}
            title="Define el formato del torneo"
            description="Elige cómo se juega. Si todo es una sola etapa (por ejemplo eliminación directa), con eso basta. Si hay grupos y luego playoffs, agregas una fase para cada uno."
            action={<Button onClick={() => setCreating(true)}>Definir formato</Button>}
          />
        )}
      </div>

      {creating && count === 0 && !custom && (
        <FormatWizard
          tournament={tournament}
          onClose={() => setCreating(false)}
          onCustom={() => setCustom(true)}
          onCreated={(stage) => setSearch({ fase: String(stage.id) }, { replace: true })}
        />
      )}
      {creating && (count > 0 || custom) && (
        <StageForm
          tournament={tournament}
          stage={null}
          nextOrder={(stages.data?.at(-1)?.order ?? 0) + 1}
          otherStages={count}
          onClose={() => {
            setCreating(false)
            setCustom(false)
          }}
          onCreated={(stage) => setSearch({ fase: String(stage.id) }, { replace: true })}
        />
      )}
    </div>
  )
}

function StagePanel({
  stage,
  tournament,
  next,
  previous,
  onCreatedNext,
}: {
  stage: Stage
  tournament: Tournament
  /** Stage played after this one (receives its qualifiers). */
  next: Stage | null
  /** Stage played before this one (its qualifiers fill this stage). */
  previous: Stage | null
  onCreatedNext: (stage: Stage) => void
}) {
  const fedByPrevious =
    !!previous &&
    (previous.stage_type === 'round_robin' || previous.stage_type === 'free_for_all') &&
    previous.advance_per_group > 0
  const matches = useMatches({ stage: stage.id })
  const detail = useStage(stage.id)
  const [modal, setModal] = useState<'draw' | 'schedule' | 'edit' | 'reset' | 'delete' | 'match' | null>(null)
  const [result, setResult] = useState<Match | null>(null)
  const [editMatch, setEditMatch] = useState<Match | null>(null)
  const [view, setView] = useState<'visual' | 'lista'>('visual')
  const toast = useToast()
  const grouped = stage.stage_type === 'round_robin' || stage.stage_type === 'free_for_all'
  const openResult = (match: Match) => {
    const ready = match.participants.length >= 2 && match.participants.every((p) => p.registration)
    if (ready) setResult(match)
    else toast.error('Este match todavía espera a los ganadores de la ronda anterior.')
  }
  const invalidate = [['matches'], ['stage', stage.id], ['stages', tournament.id], ['tournament', tournament.id]]

  const reset = useApiMutation({
    request: () => api(`stages/${stage.id}/reset/`, { method: 'POST' }),
    invalidate,
    success: 'Fase reiniciada',
    onSuccess: () => setModal(null),
  })
  const remove = useApiMutation({
    request: () => api(`stages/${stage.id}/`, { method: 'DELETE' }),
    invalidate: [['stages', tournament.id], ['tournament', tournament.id]],
    success: 'Fase eliminada',
  })

  const list = useMemo(() => matches.data ?? [], [matches.data])
  const pendingResults = list.filter((m) => m.status !== 'completed' && m.status !== 'canceled').length
  const hasResults = list.some((m) => m.status === 'completed' && !m.is_bye)
  const sections = useMemo(() => {
    const groups = new Map<string, Map<number, Match[]>>()
    for (const match of list) {
      const key = match.group_name ?? ''
      const rounds = groups.get(key) ?? new Map<number, Match[]>()
      rounds.set(match.round, [...(rounds.get(match.round) ?? []), match])
      groups.set(key, rounds)
    }
    return [...groups.entries()].map(([group, rounds]) => ({
      group,
      rounds: [...rounds.entries()].sort(([a], [b]) => a - b),
    }))
  }, [list])

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl font-semibold">{stage.name}</h2>
              <Badge tone={stage.status === 'ongoing' ? 'live' : stage.status === 'completed' ? 'win' : 'neutral'}>
                {stageStatusLabel[stage.status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-400">
              {stageTypeLabel[stage.stage_type]} · Bo{stage.best_of}
              {stage.final_best_of && stage.final_best_of !== stage.best_of && ` (final Bo${stage.final_best_of})`} ·{' '}
              {detail.data?.participants.length ?? 0} participantes ·{' '}
              {list.length} matchs{pendingResults > 0 && ` · ${pendingResults} sin resultado`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasResults ? (
              <Button
                variant="secondary"
                icon={<Shuffle size={16} />}
                disabled
                title="La fase ya tiene resultados: reiníciala para sortear de nuevo."
              >
                Sorteo cerrado
              </Button>
            ) : (
              <Button
                variant={list.length ? 'secondary' : 'primary'}
                icon={<Shuffle size={16} />}
                onClick={() => setModal('draw')}
              >
                {list.length || detail.data?.participants.length ? 'Repetir sorteo' : 'Realizar sorteo'}
              </Button>
            )}
            <Button variant="secondary" icon={<CalendarPlus size={16} />} onClick={() => setModal('schedule')} disabled={!list.length}>
              Horarios automáticos
            </Button>
            <StageMenu
              onEdit={() => setModal('edit')}
              onNewMatch={() => setModal('match')}
              onReset={() => setModal('reset')}
              onDelete={() => setModal('delete')}
            />
          </div>
        </div>
        {stage.stage_type !== 'free_for_all' && <BestOfControls stage={stage} tournament={tournament} />}
      </div>

      {grouped && stage.advance_per_group > 0 && (
        <NextStageNotice stage={stage} tournament={tournament} next={next} onCreated={onCreatedNext} />
      )}

      {stage.stage_type === 'single_elimination' &&
        !!detail.data?.participants.length &&
        !isPowerOfTwo(detail.data.participants.length) && (
          <div className="flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex gap-2 text-sm text-warn">
              <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
              Este sorteo tiene pases directos ({detail.data.participants.length} equipos en un bracket). Reinicia la fase
              y vuelve a sortear con 2, 4, 8 o 16 equipos, o elimínala y elige Liga + final.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setModal('reset')}>
              Reiniciar fase
            </Button>
          </div>
        )}

      {matches.isPending ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Shuffle size={24} />}
          title={
            stage.stage_type === 'manual'
              ? 'Crea los matchs de esta fase'
              : fedByPrevious
                ? `Esperando a los clasificados de ${previous?.name}`
                : 'Realiza el sorteo'
          }
          description={
            stage.stage_type === 'manual'
              ? 'En una fase manual tú creas cada match y defines a dónde avanza el ganador.'
              : fedByPrevious
                ? `Cuando se jueguen todos los matchs de ${previous?.name}, los clasificados se ubican aquí automáticamente según la tabla. También puedes sortearlos a mano.`
                : 'El sorteo reparte a los participantes confirmados y genera todos los matchs de la fase.'
          }
          action={
            stage.stage_type === 'manual' ? (
              <Button icon={<Plus size={16} />} onClick={() => setModal('match')}>
                Nuevo match
              </Button>
            ) : (
              <Button icon={<Shuffle size={16} />} onClick={() => setModal('draw')}>
                Realizar sorteo
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              layoutId={`stage-view-${stage.id}`}
              value={view}
              onChange={setView}
              tabs={[
                {
                  value: 'visual',
                  label: grouped ? 'Tabla y grupos' : 'Llaves',
                  icon: grouped ? <ListNumbers size={16} /> : <TreeStructure size={16} />,
                },
                { value: 'lista', label: 'Lista y horarios', icon: <ListBullets size={16} /> },
              ]}
            />
            {view === 'visual' && (
              <p className="text-xs text-ink-400">Haz clic en un match para definir o corregir el ganador.</p>
            )}
          </div>
          {view === 'visual' ? (
            <StageVisual stage={stage} onMatch={openResult} />
          ) : (
        <div className="space-y-8">
          {sections.map(({ group, rounds }) => (
            <section key={group || 'main'}>
              {group && <h3 className="mb-3 font-display text-lg font-semibold">{group}</h3>}
              <div className="space-y-5">
                {rounds.map(([round, items]) => (
                  <div key={round}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      {stage.stage_type === 'round_robin' || stage.stage_type === 'free_for_all'
                        ? `Fecha ${round}`
                        : roundLabel(items[0].label, round)}
                    </p>
                    <div className="space-y-2">
                      {items.map((match) => (
                        <AdminMatchRow
                          key={match.id}
                          match={match}
                          onResult={() => setResult(match)}
                          onEdit={() => setEditMatch(match)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
          )}
        </div>
      )}

      {modal === 'draw' && <DrawModal stage={stage} tournament={tournament} onClose={() => setModal(null)} />}
      {modal === 'schedule' && <ScheduleModal stage={stage} onClose={() => setModal(null)} />}
      {modal === 'edit' && (
        <StageForm
          tournament={tournament}
          stage={stage}
          nextOrder={stage.order}
          otherStages={tournament.stages.length - 1}
          onClose={() => setModal(null)}
        />
      )}
      {(modal === 'match' || editMatch) && (
        <MatchForm
          stage={stage}
          tournament={tournament}
          match={editMatch}
          matches={list}
          onClose={() => {
            setModal(null)
            setEditMatch(null)
          }}
        />
      )}
      <ConfirmDialog
        open={modal === 'reset'}
        title="Reiniciar fase"
        description="Se borrarán los grupos, los matchs y todos los resultados de esta fase. Después podrás hacer el sorteo de nuevo."
        confirmLabel="Reiniciar fase"
        tone="danger"
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
        onClose={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal === 'delete'}
        title="Eliminar fase"
        description="Se eliminará la fase con todos sus matchs y resultados."
        confirmLabel="Eliminar"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setModal(null)}
      />
      {result && <ResultModal match={result} onClose={() => setResult(null)} />}
    </div>
  )
}

const BEST_OF_OPTIONS = [1, 2, 3, 5, 7]

/** Best of of the whole stage, editable from the header: the matches not
 * played yet are updated (no need to edit them one by one). */
function BestOfControls({ stage, tournament }: { stage: Stage; tournament: Tournament }) {
  const save = useApiMutation({
    request: (body: Partial<Stage>) => api(`stages/${stage.id}/`, { method: 'PATCH', body }),
    invalidate: [['stages', tournament.id], ['stage', stage.id], ['matches'], ['tournament', tournament.id]],
    success: 'Bo actualizado en los matchs pendientes',
  })
  const double = stage.stage_type === 'double_elimination'
  const elimination = stage.stage_type === 'single_elimination' || double
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.06] pt-4 text-sm">
      <label className="flex items-center gap-2.5">
        <span className="whitespace-nowrap text-ink-300">
          {double ? 'Bo del upper' : elimination ? 'Bo de las rondas' : 'Bo de cada match'}
        </span>
        <Select
          className="h-9 w-24"
          value={stage.best_of}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ best_of: Number(e.target.value) })}
        >
          {BEST_OF_OPTIONS.map((value) => (
            <option key={value} value={value}>
              Bo{value}
            </option>
          ))}
        </Select>
      </label>
      {double && (
        <label className="flex items-center gap-2.5">
          <span className="whitespace-nowrap text-ink-300">Bo del lower</span>
          <Select
            className="h-9 w-28"
            value={stage.lower_best_of ?? ''}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ lower_best_of: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Igual</option>
            {BEST_OF_OPTIONS.map((value) => (
              <option key={value} value={value}>
                Bo{value}
              </option>
            ))}
          </Select>
        </label>
      )}
      {elimination && (
        <label className="flex items-center gap-2.5">
          <span className="whitespace-nowrap text-ink-300">{double ? 'Bo de la gran final' : 'Bo de la final'}</span>
          <Select
            className="h-9 w-28"
            value={stage.final_best_of ?? ''}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ final_best_of: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Igual</option>
            {BEST_OF_OPTIONS.map((value) => (
              <option key={value} value={value}>
                Bo{value}
              </option>
            ))}
          </Select>
        </label>
      )}
      <span className="text-xs text-ink-400">
        {stage.best_of % 2 === 0 && !elimination
          ? `Con Bo${stage.best_of} puede haber empate.`
          : 'Los matchs ya jugados no cambian.'}
      </span>
    </div>
  )
}

/** Tells where the qualifiers of a group stage go and, when there is no next
 * stage yet, creates it (a final for 2 qualifiers, playoffs for 4, 8...). */
function NextStageNotice({
  stage,
  tournament,
  next,
  onCreated,
}: {
  stage: Stage
  tournament: Tournament
  next: Stage | null
  onCreated: (stage: Stage) => void
}) {
  const qualifiers = stage.number_of_groups * stage.advance_per_group
  const lowerQualifiers = stage.number_of_groups * stage.lower_advance_per_group
  // Teams going to the lower bracket mean the next stage is a double
  // elimination (upper = the first places, lower = the next ones).
  const double = lowerQualifiers > 0
  const doubleFits =
    isPowerOfTwo(qualifiers) &&
    (lowerQualifiers === qualifiers || lowerQualifiers === qualifiers / 2)
  const [finalBestOf, setFinalBestOf] = useState(3)
  const create = useApiMutation({
    request: async () => {
      const created = await api<Stage>('stages/', {
        method: 'POST',
        body: double
          ? {
              tournament: tournament.id,
              order: stage.order + 1,
              name: 'Playoffs',
              stage_type: 'double_elimination',
              best_of: stage.best_of,
              lower_best_of: stage.best_of,
              final_best_of: finalBestOf,
            }
          : {
              tournament: tournament.id,
              order: stage.order + 1,
              name: qualifiers === 2 ? 'Gran final' : 'Playoffs',
              stage_type: 'single_elimination',
              best_of: qualifiers === 2 ? finalBestOf : stage.best_of,
              final_best_of: finalBestOf,
            },
      })
      // Groups already finished: draw the next stage right away.
      if (stage.status === 'completed') {
        await api(`stages/${created.id}/draw/`, { method: 'POST', body: { shuffle: false } })
      }
      return created
    },
    invalidate: [['stages', tournament.id], ['stage'], ['matches'], ['tournament', tournament.id]],
    success: qualifiers === 2 ? 'Final creada' : 'Playoffs creados',
    onSuccess: onCreated,
  })

  if (next) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-ink-900 px-4 py-3 text-sm text-ink-300">
        <ArrowRight size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Clasifican <strong className="text-ink-100">{qualifiers}</strong> ({stage.advance_per_group} por grupo)
          {double && (
            <>
              {' '}
              al upper y <strong className="text-ink-100">{lowerQualifiers}</strong> ({stage.lower_advance_per_group} por grupo)
              al lower
            </>
          )}
          . Cuando se jueguen todos los matchs pasan automáticamente a{' '}
          <strong className="text-ink-100">{next.name}</strong>, ordenados por la tabla.
        </span>
      </p>
    )
  }

  if (double && !doubleFits) {
    return (
      <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
        Van {qualifiers} al upper y {lowerQualifiers} al lower. Para una doble eliminación sin pases directos el upper debe
        ser 2, 4, 8 o 16 y el lower la misma cantidad o la mitad. Ajústalo en Editar fase.
      </p>
    )
  }

  if (!isPowerOfTwo(qualifiers)) {
    return (
      <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
        Clasifican {qualifiers} equipos ({stage.number_of_groups} grupos × {stage.advance_per_group}), pero un bracket necesita
        2, 4, 8 o 16. Cambia “Clasifican por grupo” en Editar fase.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-100">
        Clasifican <strong>{qualifiers}</strong> equipos{double && <> al upper y <strong>{lowerQualifiers}</strong> al lower</>},
        pero todavía no hay una fase siguiente.{' '}
        {double
          ? 'Crea los playoffs de doble eliminación.'
          : qualifiers === 2
            ? 'Crea la final entre los dos clasificados.'
            : `Crea los playoffs para los ${qualifiers}.`}
      </p>
      <div className="flex items-center gap-2">
        <Select
          className="h-10 w-36"
          value={finalBestOf}
          onChange={(e) => setFinalBestOf(Number(e.target.value))}
          aria-label="Bo de la final"
        >
          {BEST_OF_OPTIONS.filter((v) => v % 2 === 1).map((value) => (
            <option key={value} value={value}>
              {double ? 'Gran final' : 'Final'} Bo{value}
            </option>
          ))}
        </Select>
        <Button icon={<Trophy size={16} />} loading={create.isPending} onClick={() => create.mutate()}>
          {double ? 'Crear doble eliminación' : qualifiers === 2 ? 'Crear final' : 'Crear playoffs'}
        </Button>
      </div>
    </div>
  )
}

function StageVisual({ stage, onMatch }: { stage: Stage; onMatch: (match: Match) => void }) {
  const bracket = useBracket(stage.id)
  const grouped = stage.stage_type === 'round_robin' || stage.stage_type === 'free_for_all'
  const standings = useStandings(grouped ? stage.id : 0)
  if (bracket.isPending || (grouped && standings.isPending)) return <Skeleton className="h-72" />
  if (!grouped) {
    return (
      <div className="surface p-5">
        <BracketSections sections={bracket.data ?? []} onMatchClick={onMatch} />
      </div>
    )
  }
  const single = (standings.data?.length ?? 0) <= 1
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {(standings.data ?? []).map((group) => (
        // With a single group the table and its matches go side by side.
        <div
          key={group.group_id ?? 'all'}
          className={single ? 'grid gap-6 xl:col-span-2 xl:grid-cols-2 xl:items-start' : 'space-y-4'}
        >
          <GroupTable
                group={group}
                advance={stage.advance_per_group}
                lowerAdvance={stage.lower_advance_per_group}
                freeForAll={stage.stage_type === 'free_for_all'} />
          <GroupMatches
            onMatchClick={onMatch}
            matches={
              bracket.data?.find((section) => section.group === group.group)?.rounds.flatMap((round) => round.matches) ??
              []
            }
          />
        </div>
      ))}
    </div>
  )
}

function StageMenu({
  onEdit,
  onNewMatch,
  onReset,
  onDelete,
}: {
  onEdit: () => void
  onNewMatch: () => void
  onReset: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/[0.05]'
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" icon={<DotsThreeVertical size={18} weight="bold" />} onClick={() => setOpen((o) => !o)}>
        Más
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            className="surface absolute right-0 z-20 mt-2 w-56 p-1.5"
            onClick={() => setOpen(false)}
          >
            <button className={item} onClick={onEdit}>
              <PencilSimple size={16} /> Editar fase
            </button>
            <button className={item} onClick={onNewMatch}>
              <Plus size={16} /> Nuevo match manual
            </button>
            <button className={cx(item, 'text-warn')} onClick={onReset}>
              <ArrowCounterClockwise size={16} /> Reiniciar fase
            </button>
            <button className={cx(item, 'text-accent')} onClick={onDelete}>
              <Trash size={16} /> Eliminar fase
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------- match

function AdminMatchRow({ match, onResult, onEdit }: { match: Match; onResult: () => void; onEdit: () => void }) {
  const [date, setDate] = useState(toInputDateTime(match.scheduled_at))
  // Keep the field in sync when the date changes elsewhere (automatic
  // schedule, another admin, a refetch).
  const [syncedDate, setSyncedDate] = useState(match.scheduled_at)
  if (match.scheduled_at !== syncedDate) {
    setSyncedDate(match.scheduled_at)
    setDate(toInputDateTime(match.scheduled_at))
  }
  const invalidate = [['matches'], ['stage'], ['tournament']]
  const patch = useApiMutation({
    request: (body: Record<string, unknown>) => api(`matches/${match.id}/`, { method: 'PATCH', body }),
    invalidate,
    success: 'Match actualizado',
  })
  const resetResult = useApiMutation({
    request: () => api(`matches/${match.id}/reset-result/`, { method: 'POST' }),
    invalidate,
    success: 'Resultado reiniciado',
  })
  const ready = match.participants.length >= 2 && match.participants.every((p) => p.registration)
  const completed = match.status === 'completed'
  const ffa = match.participants.length > 2
  const dateChanged = date !== toInputDateTime(match.scheduled_at)
  // The date is saved when leaving the field (or pressing Enter): no extra
  // button that would move the row.
  const saveDate = () => {
    if (dateChanged) patch.mutate({ scheduled_at: fromInputDateTime(date) })
  }

  const [a, b] = [...match.participants].sort((x, y) => x.slot - y.slot)
  const scored = hasScore(match)

  return (
    <div className={cx('surface overflow-hidden', match.status === 'live' && 'border-live/40')}>
      {ffa ? (
        <p className="px-4 pb-3 pt-4 text-center text-sm text-ink-300">
          {match.participants.length} participantes
          {completed && (
            <span className="text-win">
              {' '}
              · Ganador: {match.participants.find((p) => p.registration === match.winner)?.registration_name}
            </span>
          )}
        </p>
      ) : (
        // Scoreboard over the whole width: team A aligned to the right, the
        // score (or VS) in the middle and team B aligned to the left.
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 pb-3 pt-4">
          <ScoreSide participant={a} match={match} align="right" />
          <div className="flex min-w-16 justify-center">
            {scored ? (
              <span className="font-mono text-xl font-semibold tabular-nums">
                <span className={a?.registration === match.winner ? 'text-win' : 'text-ink-300'}>{a?.score}</span>
                <span className="mx-2 text-ink-600">:</span>
                <span className={b?.registration === match.winner ? 'text-win' : 'text-ink-300'}>{b?.score}</span>
              </span>
            ) : (
              <span className="rounded-md bg-ink-800 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                {completed && !match.winner ? 'Empate' : 'vs'}
              </span>
            )}
          </div>
          <ScoreSide participant={b} match={match} align="left" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] bg-ink-950/30 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onBlur={saveDate}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="h-8 w-52 text-xs"
              aria-label="Fecha y hora (se guarda al salir del campo)"
              title="Se guarda al salir del campo"
            />
            <span className="grid size-4 place-items-center text-ink-400" aria-live="polite">
              {patch.isPending && <CircleNotch size={14} className="animate-spin" />}
            </span>
          </div>
          <span className="text-xs text-ink-400">
            {match.label ? roundLabel(match.label, match.round) : `Match ${match.position}`} · Bo{match.best_of}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={match.status} />
          {!completed && ready && (
            <Button
              size="sm"
              variant={match.status === 'live' ? 'secondary' : 'ghost'}
              icon={<Broadcast size={14} />}
              loading={patch.isPending}
              onClick={() => patch.mutate({ status: match.status === 'live' ? 'scheduled' : 'live' })}
            >
              {match.status === 'live' ? 'Quitar en vivo' : 'En vivo'}
            </Button>
          )}
          {completed ? (
            <>
              <Button size="sm" variant="secondary" onClick={onResult}>
                Corregir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowCounterClockwise size={14} />}
                loading={resetResult.isPending}
                onClick={() => resetResult.mutate()}
              >
                Reiniciar
              </Button>
            </>
          ) : (
            <Button size="sm" icon={<Trophy size={14} />} disabled={!ready} onClick={onResult} title={ready ? '' : 'Faltan participantes'}>
              Definir ganador
            </Button>
          )}
          <button
            onClick={onEdit}
            className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-white/5 hover:text-ink-100"
            aria-label="Editar match"
          >
            <PencilSimple size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** One side of the scoreboard: logo next to the center, name outside. */
function ScoreSide({
  participant,
  match,
  align,
}: {
  participant: Match['participants'][number] | undefined
  match: Match
  align: 'left' | 'right'
}) {
  const completed = match.status === 'completed'
  const winner = completed && !!participant?.registration && participant.registration === match.winner
  const loser = completed && match.winner !== null && !winner
  const name = participant?.registration_name ?? 'Por definir'
  return (
    <div
      className={cx(
        'flex min-w-0 max-w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition',
        align === 'right' ? 'flex-row-reverse justify-self-end text-right' : 'justify-self-start text-left',
        winner && 'bg-win-soft',
        loser && 'opacity-50',
      )}
    >
      {participant?.registration ? (
        <TeamLogo src={participant.logo} name={name} size={28} />
      ) : (
        <span className="size-7 shrink-0 rounded-md border border-dashed border-white/10" />
      )}
      <span
        className={cx(
          'min-w-0 truncate text-sm',
          winner ? 'font-semibold text-win' : 'font-medium text-ink-100',
          !participant?.registration && 'font-normal italic text-ink-600',
        )}
        title={name}
      >
        {name}
      </span>
      {winner && <Crown size={14} weight="fill" className="shrink-0 text-win" />}
    </div>
  )
}

function ResultModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const participants = [...match.participants].sort((a, b) => a.slot - b.slot)
  const ffa = participants.length > 2
  // 'draw' only exists when the match allows ties (league with even Bo).
  const [winner, setWinner] = useState<number | 'draw' | null>(
    match.status === 'completed' && match.winner === null && match.can_draw ? 'draw' : match.winner,
  )
  const isDraw = winner === 'draw'
  const [scores, setScores] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      participants.map((p) => [p.registration!, match.status === 'completed' ? String(p.score) : '']),
    ),
  )
  const hasScores = Object.values(scores).some((value) => value !== '')

  const save = useApiMutation({
    request: () => {
      const body: Record<string, unknown> = {}
      if (isDraw) body.draw = true
      else if (!ffa && winner) body.winner = winner
      if (ffa || hasScores) {
        body.scores = participants.map((p) => ({ registration: p.registration, score: Number(scores[p.registration!] || 0) }))
      }
      return api(`matches/${match.id}/result/`, { method: 'POST', body })
    },
    invalidate: [['matches'], ['stage'], ['stages'], ['tournament'], ['tournaments']],
    success: isDraw ? 'Empate registrado.' : 'Resultado guardado. El ganador avanzó.',
    onSuccess: onClose,
  })

  const canSave = ffa ? participants.every((p) => scores[p.registration!] !== '') : winner !== null || hasScores

  return (
    <Modal
      open
      onClose={onClose}
      title={ffa ? 'Registrar puntos' : 'Definir ganador'}
      description={
        ffa
          ? 'Ingresa los puntos de cada participante. El orden se calcula solo.'
          : match.can_draw
            ? `Toca al ganador o elige empate (posible en Bo${match.best_of}). El marcador es opcional.`
            : 'Toca al equipo ganador. El marcador es opcional. El ganador avanza y el perdedor queda eliminado.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<CheckCircle size={16} />} loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
            Guardar resultado
          </Button>
        </>
      }
    >
      {ffa ? (
        <div className="space-y-2">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-850 p-3">
              <TeamLogo src={p.logo} name={p.registration_name ?? '?'} size={28} />
              <span className="flex-1 truncate text-sm font-medium">{p.registration_name}</span>
              <Input
                type="number"
                className="h-9 w-24 text-right font-mono"
                value={scores[p.registration!]}
                onChange={(e) => setScores((s) => ({ ...s, [p.registration!]: e.target.value }))}
                aria-label={`Puntos de ${p.registration_name}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className={cx('grid gap-3', match.can_draw ? 'sm:grid-cols-[1fr_auto_1fr]' : 'sm:grid-cols-2')}>
            {participants.map((p, index) => {
              const active = winner === p.registration
              const card = (
                <motion.button
                  key={p.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setWinner(p.registration)}
                  className={cx(
                    'relative flex flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center transition',
                    active ? 'border-win bg-win-soft' : 'border-white/[0.08] bg-ink-850 hover:border-white/20',
                  )}
                >
                  <AnimatePresence>
                    {active && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                        className="absolute right-3 top-3 text-win"
                      >
                        <Crown size={22} weight="fill" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <TeamLogo src={p.logo} name={p.registration_name ?? '?'} size={56} />
                  <span className="font-display text-lg font-semibold">{p.registration_name}</span>
                  <span className={cx('text-xs font-semibold uppercase tracking-wide', active ? 'text-win' : 'text-ink-400')}>
                    {active ? 'Ganador' : 'Elegir ganador'}
                  </span>
                </motion.button>
              )
              if (!(match.can_draw && index === 1)) return card
              return [
                <button
                  key="draw"
                  type="button"
                  onClick={() => setWinner('draw')}
                  className={cx(
                    'flex items-center justify-center rounded-2xl border-2 px-5 py-3 text-sm font-semibold uppercase tracking-wide transition',
                    isDraw ? 'border-warn bg-warn-soft text-warn' : 'border-white/[0.08] bg-ink-850 text-ink-400 hover:border-white/20',
                  )}
                >
                  Empate
                </button>,
                card,
              ]
            })}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-300">Marcador (opcional)</p>
            <div className="flex items-center gap-3">
              {participants.map((p, index) => (
                <div key={p.id} className="flex items-center gap-3">
                  {index === 1 && <span className="text-ink-600">-</span>}
                  <Input
                    type="number"
                    min={0}
                    className="h-11 w-20 text-center font-mono text-lg"
                    value={scores[p.registration!]}
                    onChange={(e) => setScores((s) => ({ ...s, [p.registration!]: e.target.value }))}
                    aria-label={`Marcador de ${p.registration_name}`}
                  />
                </div>
              ))}
              <span className="text-xs text-ink-400">Bo{match.best_of}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- draw

function DrawModal({ stage, tournament, onClose }: { stage: Stage; tournament: Tournament; onClose: () => void }) {
  const participants = useParticipants(tournament.id)
  const [shuffle, setShuffle] = useState(true)
  const [manual, setManual] = useState(stage.stage_type === 'manual')
  const [chosen, setChosen] = useState<number[]>([])
  const [preview, setPreview] = useState<DrawResult | null>(null)
  const firstStage = stage.order === Math.min(...tournament.stages.map((s) => s.order))
  const grouped = stage.stage_type === 'round_robin' || stage.stage_type === 'free_for_all'
  // Known before drawing for the first stage (confirmed teams) or when the
  // participants are chosen by hand; qualifiers are checked by the API.
  const knownCount = manual ? chosen.length : firstStage ? (participants.data?.length ?? null) : null
  const bracketProblem =
    knownCount !== null &&
    knownCount > 0 &&
    ((stage.stage_type === 'single_elimination' && !isPowerOfTwo(knownCount)) ||
      (stage.stage_type === 'double_elimination' && (!isPowerOfTwo(knownCount) || knownCount < 4)))

  const makePreview = useApiMutation({
    request: () =>
      api<DrawResult>(`stages/${stage.id}/draw/`, {
        method: 'POST',
        body: { shuffle, preview: true, registration_ids: manual ? chosen : [] },
      }),
    onSuccess: setPreview,
  })
  const confirm = useApiMutation({
    // The preview order is sent back without shuffling, so the saved draw is
    // exactly the one the admin saw.
    request: () =>
      api(`stages/${stage.id}/draw/`, {
        method: 'POST',
        body: {
          shuffle: false,
          registration_ids: preview?.seeding ?? [],
          lower_registration_ids: preview?.lower_seeding ?? [],
        },
      }),
    invalidate: [['matches'], ['stage', stage.id], ['stages', tournament.id], ['tournament', tournament.id]],
    success: 'Sorteo confirmado',
    onSuccess: onClose,
  })

  const toggle = (id: number) =>
    setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  if (preview) {
    return (
      <Modal
        open
        wide
        onClose={onClose}
        title="Vista previa del sorteo"
        description="Todavía no se guardó nada. Si no te gusta la distribución, sortea de nuevo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Cambiar opciones
            </Button>
            {shuffle && (
              <Button
                variant="secondary"
                icon={<Shuffle size={16} />}
                loading={makePreview.isPending}
                onClick={() => makePreview.mutate()}
              >
                Sortear de nuevo
              </Button>
            )}
            <Button icon={<CheckCircle size={16} />} loading={confirm.isPending} onClick={() => confirm.mutate()}>
              Confirmar sorteo
            </Button>
          </>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={preview.seeding.join('-')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {grouped ? (
              <div className={cx('grid gap-4', preview.groups.length > 1 && 'sm:grid-cols-2')}>
                {preview.groups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-white/[0.06] bg-ink-850">
                    <p className="border-b border-white/[0.06] px-4 py-2.5 font-display font-semibold">
                      {preview.groups.length > 1 ? group.name : `Liga · ${group.participants.length} participantes`}
                    </p>
                    <ol
                      className={cx(
                        'divide-y divide-white/[0.04]',
                        preview.groups.length === 1 && 'sm:grid sm:grid-cols-2 sm:divide-y-0',
                      )}
                    >
                      {group.participants.map((registration, index) => (
                        <li key={registration.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <span className="w-4 font-mono text-xs text-ink-400">{index + 1}</span>
                          <TeamLogo src={registration.logo} name={registration.display_name} size={22} />
                          {registration.display_name}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : preview.bracket.length ? (
              <BracketSections sections={preview.bracket} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {preview.participants.map((registration) => (
                  <li key={registration.id} className="flex items-center gap-3 rounded-lg bg-ink-850 px-3 py-2 text-sm">
                    <TeamLogo src={registration.logo} name={registration.display_name} size={22} />
                    {registration.display_name}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Sorteo"
      description="Primero verás una vista previa de los grupos o las llaves. Nada se guarda hasta que confirmes."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Shuffle size={16} />}
            loading={makePreview.isPending}
            disabled={(manual && chosen.length < 2) || bracketProblem}
            onClick={() => makePreview.mutate()}
          >
            Ver vista previa
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {bracketProblem && (
          <div className="flex gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
            <span>
              Hay {knownCount} participantes. La eliminación directa necesita 2, 4, 8, 16 o 32 para que nadie pase directo.
              Elige a mano una cantidad exacta, o cambia el formato a <strong>Liga + final</strong> (Más → Eliminar fase).
            </span>
          </div>
        )}
        <div className="rounded-xl border border-white/[0.06] bg-ink-850 p-4 text-sm">
          {manual
            ? `Participarán los ${chosen.length} seleccionados.`
            : firstStage
              ? `Participarán los ${participants.data?.length ?? '...'} equipos confirmados y habilitados.`
              : 'Participarán los clasificados de la fase anterior (los mejores de cada grupo).'}
        </div>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Orden aleatorio</span>
            <span className="block text-xs text-ink-400">Desactívalo para respetar el seed de cada equipo.</span>
          </span>
          <Toggle checked={shuffle} onChange={setShuffle} label="Orden aleatorio" />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Elegir participantes</span>
            <span className="block text-xs text-ink-400">Selecciona a mano quién entra a esta fase.</span>
          </span>
          <Toggle checked={manual} onChange={setManual} label="Elegir participantes" />
        </label>
        {manual && (
          <div className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] p-2">
            {(participants.data ?? []).map((registration) => (
              <label
                key={registration.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(registration.id)}
                  onChange={() => toggle(registration.id)}
                  className="accent-[var(--color-accent)]"
                />
                <TeamLogo src={registration.logo} name={registration.display_name} size={22} />
                <span className="text-sm">{registration.display_name}</span>
                {chosen.includes(registration.id) && !shuffle && (
                  <span className="ml-auto font-mono text-xs text-ink-400">#{chosen.indexOf(registration.id) + 1}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function ScheduleModal({ stage, onClose }: { stage: Stage; onClose: () => void }) {
  const [start, setStart] = useState('')
  const [gap, setGap] = useState('60')
  const [parallel, setParallel] = useState('1')
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const save = useApiMutation({
    request: () =>
      api<{ scheduled_matches: number }>(`stages/${stage.id}/auto-schedule/`, {
        method: 'POST',
        body: {
          start: fromInputDateTime(start),
          interval_minutes: Number(gap),
          parallel: Number(parallel),
          only_unscheduled: onlyEmpty,
        },
      }),
    invalidate: [['matches'], ['tournament']],
    success: (result) => `${result.scheduled_matches} matchs programados`,
    onSuccess: onClose,
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Horarios automáticos"
      description="Asigna fecha y hora a los matchs en orden de ronda. Luego puedes ajustar cada uno a mano."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!start} onClick={() => save.mutate()}>
            Programar
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Primer match" className="sm:col-span-2">
          {(id) => <Input id={id} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field label="Minutos entre turnos">
          {(id) => <Input id={id} type="number" min={1} value={gap} onChange={(e) => setGap(e.target.value)} />}
        </Field>
        <Field label="Matchs al mismo tiempo" hint="Según cuántas PCs o salas tengan.">
          {(id) => <Input id={id} type="number" min={1} value={parallel} onChange={(e) => setParallel(e.target.value)} />}
        </Field>
        <label className="flex items-center justify-between gap-4 sm:col-span-2">
          <span className="text-sm">Solo matchs sin fecha</span>
          <Toggle checked={onlyEmpty} onChange={setOnlyEmpty} label="Solo matchs sin fecha" />
        </label>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------- stage form

const typeHelp: Record<StageType, string> = {
  round_robin: 'Matchs 1 vs 1: cada equipo se enfrenta a todos los demás. Tabla con victorias, empates y derrotas. Ej. liga o fase de grupos de Dota 2.',
  single_elimination: 'Bracket: el que pierde queda eliminado y el ganador avanza solo. Ej. playoffs.',
  double_elimination:
    'Upper y lower bracket: quien pierde en upper cae al lower; quien pierde en lower queda fuera. Gran final entre ambos ganadores.',
  free_for_all: 'Sin enfrentamientos 1 vs 1: todos juegan la misma partida y suman los puntos que obtienen. Ej. battle royale o puntaje de campaña.',
  manual: 'Tú creas los matchs y conectas a dónde va el ganador o el perdedor. Para formatos especiales.',
}

function StageForm({
  tournament,
  stage,
  nextOrder,
  otherStages,
  onClose,
  onCreated,
}: {
  tournament: Tournament
  stage: Stage | null
  nextOrder: number
  /** Number of stages of the tournament besides this one. */
  otherStages: number
  onClose: () => void
  onCreated?: (stage: Stage) => void
}) {
  const [form, setForm] = useState({
    name: stage?.name ?? '',
    order: stage?.order ?? nextOrder,
    stage_type: (stage?.stage_type ?? 'round_robin') as StageType,
    best_of: stage?.best_of ?? 1,
    final_best_of: stage?.final_best_of ?? null,
    lower_best_of: stage?.lower_best_of ?? null,
    lower_advance_per_group: stage?.lower_advance_per_group ?? 0,
    number_of_groups: stage?.number_of_groups ?? 1,
    advance_per_group: stage?.advance_per_group ?? 0,
    round_robin_legs: stage?.round_robin_legs ?? 1,
    ffa_rounds: stage?.ffa_rounds ?? 1,
    third_place_match: stage?.third_place_match ?? false,
    points_win: stage?.points_win ?? 3,
    points_draw: stage?.points_draw ?? 1,
    points_loss: stage?.points_loss ?? 0,
  })
  const set = (field: keyof typeof form, value: string | number | boolean | null) =>
    setForm((f) => ({ ...f, [field]: value }))

  const single = otherStages === 0
  const participants = useParticipants(tournament.id)
  const teams = participants.data?.length ?? 0
  // Only the first stage is drawn with the confirmed teams; later stages use
  // the qualifiers of the previous one (validated when drawing).
  const firstStage = form.order <= Math.min(...tournament.stages.filter((s) => s.id !== stage?.id).map((s) => s.order), Infinity)
  const bracketWarning =
    (form.stage_type === 'single_elimination' || form.stage_type === 'double_elimination') &&
    firstStage &&
    teams > 0 &&
    !isPowerOfTwo(teams)
  const save = useApiMutation({
    request: () => {
      // The name is optional: by default the stage is called like its format.
      const body = { ...form, name: form.name.trim() || stageTypeLabel[form.stage_type] }
      return stage
        ? api<Stage>(`stages/${stage.id}/`, { method: 'PATCH', body })
        : api<Stage>('stages/', { method: 'POST', body: { ...body, tournament: tournament.id } })
    },
    invalidate: [['stages', tournament.id], ['stage'], ['tournament', tournament.id]],
    success: single ? 'Formato guardado' : stage ? 'Fase actualizada' : 'Fase creada',
    onSuccess: (result) => {
      onCreated?.(result)
      onClose()
    },
  })
  const errors = save.error?.fields ?? {}
  const grouped = form.stage_type === 'round_robin' || form.stage_type === 'free_for_all'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={single ? (stage ? 'Editar formato' : 'Formato del torneo') : stage ? 'Editar fase' : 'Nueva fase'}
      description={
        single
          ? 'Cómo se juega el torneo. Si luego hay otra etapa (por ejemplo playoffs), la agregas aparte.'
          : 'Las fases se juegan en orden: los clasificados de una pasan a la siguiente.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="stage-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="stage-form" onSubmit={submit} className="space-y-6">
        <div className={cx('grid gap-5', !single && 'sm:grid-cols-[1fr_120px]')}>
          <Field label="Nombre (opcional)" error={errors.name} hint={single ? 'Si lo dejas vacío se usa el nombre del formato.' : undefined}>
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder={stageTypeLabel[form.stage_type]}
              />
            )}
          </Field>
          {!single && (
            <Field label="Orden" error={errors.order} hint="1 se juega primero.">
              {(id) => <NumberInput id={id} min={1} value={form.order} onValueChange={(v) => set('order', v)} />}
            </Field>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-300">Formato</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(typeHelp) as StageType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set('stage_type', type)}
                className={cx(
                  'rounded-xl border p-3 text-left transition',
                  form.stage_type === type ? 'border-accent bg-accent-soft' : 'border-white/[0.08] hover:border-white/20',
                )}
              >
                <span className="block text-sm font-semibold">{stageTypeLabel[type]}</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-400">{typeHelp[type]}</span>
              </button>
            ))}
          </div>
          {bracketWarning && (
            <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
              Con {teams} equipos confirmados habría pases directos. La eliminación directa necesita 2, 4, 8, 16 o 32:
              usa Liga / grupos (por ejemplo con una final aparte) o ajusta los participantes antes del sorteo.
            </p>
          )}
          {errors.detail && <p className="mt-2 text-xs text-accent">{errors.detail}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label={
              form.stage_type === 'double_elimination'
                ? 'Bo del upper'
                : form.stage_type === 'single_elimination'
                  ? 'Bo de las rondas'
                  : 'Bo de cada match'
            }
            hint="Partidas por match."
          >
            {(id) => (
              <Select id={id} value={form.best_of} onChange={(e) => set('best_of', Number(e.target.value))}>
                {BEST_OF_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    Bo{value}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {form.stage_type === 'double_elimination' && (
            <Field label="Bo del lower" hint="Vacío = igual que el upper.">
              {(id) => (
                <Select
                  id={id}
                  value={form.lower_best_of ?? ''}
                  onChange={(e) => set('lower_best_of', e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Igual (Bo{form.best_of})</option>
                  {BEST_OF_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      Bo{value}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {(form.stage_type === 'single_elimination' || form.stage_type === 'double_elimination') && (
            <Field
              label={form.stage_type === 'double_elimination' ? 'Bo de la gran final' : 'Bo de la final'}
              hint="Vacío = igual que el resto."
            >
              {(id) => (
                <Select
                  id={id}
                  value={form.final_best_of ?? ''}
                  onChange={(e) => set('final_best_of', e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Igual (Bo{form.best_of})</option>
                  {[1, 3, 5, 7].map((value) => (
                    <option key={value} value={value}>
                      Bo{value}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {grouped && (
            <>
              <Field label="Número de grupos">
                {(id) => <NumberInput id={id} min={1} value={form.number_of_groups} onValueChange={(v) => set('number_of_groups', v)} />}
              </Field>
              <Field label="Clasifican por grupo" hint="A la siguiente fase (al upper si es doble eliminación).">
                {(id) => <NumberInput id={id} min={0} value={form.advance_per_group} onValueChange={(v) => set('advance_per_group', v)} />}
              </Field>
              <Field label="Pasan al lower por grupo" hint="Solo si la siguiente fase es doble eliminación.">
                {(id) => (
                  <NumberInput
                    id={id}
                    min={0}
                    value={form.lower_advance_per_group}
                    onValueChange={(v) => set('lower_advance_per_group', v)}
                  />
                )}
              </Field>
            </>
          )}
          {form.stage_type === 'round_robin' && (
            <>
              <Field label="Vueltas (ida y vuelta)" hint="1 = cada pareja se enfrenta una vez. 2 = dos veces.">
                {(id) => (
                  <NumberInput id={id} min={1} max={2} value={form.round_robin_legs} onValueChange={(v) => set('round_robin_legs', v)} />
                )}
              </Field>
              <Field label="Pts victoria">
                {(id) => <NumberInput id={id} value={form.points_win} onValueChange={(v) => set('points_win', v)} />}
              </Field>
              {form.best_of % 2 === 0 ? (
                <Field label="Pts empate" hint={`Posible en Bo${form.best_of} (ej. 1-1).`}>
                  {(id) => <NumberInput id={id} value={form.points_draw} onValueChange={(v) => set('points_draw', v)} />}
                </Field>
              ) : (
                <p className="self-end pb-3 text-xs leading-relaxed text-ink-400">
                  Con Bo{form.best_of} siempre hay ganador, no hay empates.
                </p>
              )}
            </>
          )}
          {form.stage_type === 'free_for_all' && (
            <Field label="Partidas por grupo">
              {(id) => <NumberInput id={id} min={1} value={form.ffa_rounds} onValueChange={(v) => set('ffa_rounds', v)} />}
            </Field>
          )}
        </div>
        {form.stage_type === 'single_elimination' && (
          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
            <span>
              <span className="block text-sm font-medium">Match por el tercer lugar</span>
              <span className="block text-xs text-ink-400">Los perdedores de semifinales juegan por el 3er puesto.</span>
            </span>
            <Toggle checked={form.third_place_match} onChange={(v) => set('third_place_match', v)} label="Tercer lugar" />
          </label>
        )}
      </form>
    </Modal>
  )
}

// ----------------------------------------------------------- match form

function MatchForm({
  stage,
  tournament,
  match,
  matches,
  onClose,
}: {
  stage: Stage
  tournament: Tournament
  match: Match | null
  matches: Match[]
  onClose: () => void
}) {
  const participants = useParticipants(tournament.id)
  const sorted = match ? [...match.participants].sort((a, b) => a.slot - b.slot) : []
  const [form, setForm] = useState({
    round: match?.round ?? 1,
    position: match?.position ?? matches.length + 1,
    label: match?.label ?? '',
    best_of: match?.best_of ?? stage.best_of,
    scheduled_at: toInputDateTime(match?.scheduled_at),
    slots: sorted.length ? sorted.map((p) => p.registration) : ([null, null] as (number | null)[]),
    next_match: match?.next_match ?? null,
    next_match_slot: match?.next_match_slot ?? 1,
    loser_next_match: match?.loser_next_match ?? null,
    loser_next_match_slot: match?.loser_next_match_slot ?? 1,
  })
  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [field]: value }))
  const others = matches.filter((m) => m.id !== match?.id)
  const locked = match?.status === 'completed'

  const save = useApiMutation({
    request: () => {
      const body = {
        stage: stage.id,
        round: form.round,
        position: form.position,
        label: form.label,
        best_of: form.best_of,
        scheduled_at: fromInputDateTime(form.scheduled_at),
        ...(locked ? {} : { registration_ids: form.slots }),
        next_match: form.next_match,
        next_match_slot: form.next_match ? form.next_match_slot : null,
        loser_next_match: form.loser_next_match,
        loser_next_match_slot: form.loser_next_match ? form.loser_next_match_slot : null,
      }
      return match
        ? api(`matches/${match.id}/`, { method: 'PATCH', body })
        : api('matches/', { method: 'POST', body })
    },
    invalidate: [['matches'], ['stage', stage.id]],
    success: match ? 'Match actualizado' : 'Match creado',
    onSuccess: onClose,
  })
  const remove = useApiMutation({
    request: () => api(`matches/${match!.id}/`, { method: 'DELETE' }),
    invalidate: [['matches'], ['stage', stage.id]],
    success: 'Match eliminado',
    onSuccess: onClose,
  })
  const errors = save.error?.fields ?? {}
  const matchName = (m: Match) =>
    `${m.label || `Ronda ${m.round}`} #${m.position} · ${m.participants.map((p) => p.registration_name ?? '?').join(' vs ')}`

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={match ? 'Editar match' : 'Nuevo match'}
      description="Para brackets manuales indica a qué match avanza el ganador (y el perdedor, si aplica)."
      footer={
        <>
          {match && !locked && (
            <Button variant="ghost" icon={<Trash size={16} />} loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-4">
          <Field label="Ronda">
            {(id) => <NumberInput id={id} min={1} value={form.round} onValueChange={(v) => set('round', v)} />}
          </Field>
          <Field label="Posición">
            {(id) => (
              <NumberInput id={id} min={1} value={form.position} onValueChange={(v) => set('position', v)} />
            )}
          </Field>
          <Field label="Mejor de">
            {(id) => (
              <NumberInput id={id} min={1} value={form.best_of} onValueChange={(v) => set('best_of', v)} />
            )}
          </Field>
          <Field label="Nombre (opcional)">
            {(id) => <Input id={id} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Gran final" />}
          </Field>
          <Field label="Fecha y hora" className="sm:col-span-2">
            {(id) => (
              <Input id={id} type="datetime-local" value={form.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} />
            )}
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-300">Participantes</p>
          {locked && <p className="mb-2 text-xs text-warn">Reinicia el resultado para cambiar a los participantes.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {form.slots.map((value, index) => (
              <Select
                key={index}
                disabled={locked}
                value={value ?? ''}
                aria-label={`Participante ${index + 1}`}
                onChange={(e) =>
                  set(
                    'slots',
                    form.slots.map((v, i) => (i === index ? (e.target.value ? Number(e.target.value) : null) : v)),
                  )
                }
              >
                <option value="">Por definir</option>
                {(participants.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name}
                  </option>
                ))}
              </Select>
            ))}
          </div>
          {!locked && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              icon={<Plus size={14} />}
              onClick={() => set('slots', [...form.slots, null])}
            >
              Agregar participante (todos contra todos)
            </Button>
          )}
          {errors.registration_ids && <p className="mt-2 text-xs text-accent">{errors.registration_ids}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_110px]">
          <Field label="El ganador avanza a" error={errors.next_match}>
            {(id) => (
              <Select
                id={id}
                value={form.next_match ?? ''}
                onChange={(e) => set('next_match', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Ninguno (fin)</option>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {matchName(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Lugar">
            {(id) => (
              <Select id={id} value={form.next_match_slot} onChange={(e) => set('next_match_slot', Number(e.target.value))}>
                <option value={1}>Arriba</option>
                <option value={2}>Abajo</option>
              </Select>
            )}
          </Field>
          <Field label="El perdedor pasa a" hint="Ej. llave de perdedores o tercer lugar." error={errors.loser_next_match}>
            {(id) => (
              <Select
                id={id}
                value={form.loser_next_match ?? ''}
                onChange={(e) => set('loser_next_match', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Queda eliminado</option>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {matchName(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Lugar">
            {(id) => (
              <Select
                id={id}
                value={form.loser_next_match_slot}
                onChange={(e) => set('loser_next_match_slot', Number(e.target.value))}
              >
                <option value={1}>Arriba</option>
                <option value={2}>Abajo</option>
              </Select>
            )}
          </Field>
        </div>
        {errors.detail && <p className="text-sm text-accent">{errors.detail}</p>}
      </div>
    </Modal>
  )
}
