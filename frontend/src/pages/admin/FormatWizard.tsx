import {
  Check,
  GitMerge,
  ListNumbers,
  Ranking,
  Rows,
  SlidersHorizontal,
  TreeStructure,
  Trophy,
  UsersFour,
  Warning,
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { Button, cx, Field, Modal, NumberInput, Toggle } from '../../components/ui'
import { api } from '../../lib/api'
import { useApiMutation, useParticipants } from '../../lib/queries'
import { isPowerOfTwo } from '../../lib/tournament'
import type { Stage, StageType, Tournament } from '../../lib/types'

/** Settings the admin can adjust on a template. */
export interface FormatOptions {
  bestOf: number
  finalBestOf: number
  groups: number
  advance: number
  thirdPlace: boolean
  ffaRounds: number
  /** Double elimination. */
  lowerAdvance: number
  upperBestOf: number
  lowerBestOf: number
}

type StageDraft = Partial<Stage> & { name: string; stage_type: StageType }

interface Template {
  id: string
  title: string
  description: string
  example: string
  icon: ReactNode
  fields: (keyof FormatOptions)[]
  stages: (options: FormatOptions) => StageDraft[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'elimination',
    title: 'Eliminación directa',
    description: 'Bracket desde el inicio: el que pierde queda eliminado. El sorteo arma las llaves.',
    example: 'Ej. 8 equipos → cuartos Bo1, semis Bo1, final Bo3.',
    icon: <TreeStructure size={22} />,
    fields: ['bestOf', 'finalBestOf', 'thirdPlace'],
    stages: (o) => [
      {
        name: 'Eliminación directa',
        stage_type: 'single_elimination',
        best_of: o.bestOf,
        final_best_of: o.finalBestOf,
        third_place_match: o.thirdPlace,
      },
    ],
  },
  {
    id: 'league',
    title: 'Liga (todos contra todos)',
    description: 'Matchs 1 vs 1: cada equipo se enfrenta a todos los demás y gana el primero de la tabla.',
    example: 'Ej. 8 equipos → 7 fechas Bo1, campeón por puntos.',
    icon: <ListNumbers size={22} />,
    fields: ['bestOf'],
    stages: (o) => [{ name: 'Liga', stage_type: 'round_robin', best_of: o.bestOf, number_of_groups: 1 }],
  },
  {
    id: 'league-final',
    title: 'Liga + final',
    description: 'Todos contra todos y los 2 primeros de la tabla juegan la gran final.',
    example: 'Ej. liga en Bo1 y final Bo3 o Bo5 entre el 1° y el 2°.',
    icon: <Trophy size={22} />,
    fields: ['bestOf', 'finalBestOf'],
    stages: (o) => [
      { name: 'Liga', stage_type: 'round_robin', best_of: o.bestOf, number_of_groups: 1, advance_per_group: 2 },
      { name: 'Gran final', stage_type: 'single_elimination', best_of: o.finalBestOf, final_best_of: o.finalBestOf },
    ],
  },
  {
    id: 'groups-playoffs',
    title: 'Grupos + playoffs',
    description: 'Grupos de todos contra todos y los mejores de cada grupo pasan a un bracket.',
    example: 'Ej. 2 grupos de 4, pasan 2 por grupo a semifinales.',
    icon: <UsersFour size={22} />,
    fields: ['bestOf', 'groups', 'advance', 'finalBestOf', 'thirdPlace'],
    stages: (o) => [
      {
        name: 'Fase de grupos',
        stage_type: 'round_robin',
        best_of: o.bestOf,
        number_of_groups: o.groups,
        advance_per_group: o.advance,
      },
      {
        name: 'Playoffs',
        stage_type: 'single_elimination',
        best_of: o.bestOf,
        final_best_of: o.finalBestOf,
        third_place_match: o.thirdPlace,
      },
    ],
  },
  {
    id: 'double',
    title: 'Doble eliminación',
    description: 'Upper y lower bracket: quien pierde en upper cae al lower y quien pierde en lower queda fuera.',
    example: 'Ej. 8 equipos en upper Bo1, lower Bo1, gran final Bo3.',
    icon: <GitMerge size={22} />,
    fields: ['upperBestOf', 'lowerBestOf', 'finalBestOf'],
    stages: (o) => [
      {
        name: 'Doble eliminación',
        stage_type: 'double_elimination',
        best_of: o.upperBestOf,
        lower_best_of: o.lowerBestOf,
        final_best_of: o.finalBestOf,
      },
    ],
  },
  {
    id: 'groups-double',
    title: 'Grupos + doble eliminación',
    description: 'Los primeros de cada grupo pasan al upper y los siguientes al lower, como en los torneos de Dota 2.',
    example: 'Ej. 4 grupos de 4: 1° y 2° al upper, 3° y 4° al lower.',
    icon: <Rows size={22} />,
    fields: ['bestOf', 'groups', 'advance', 'lowerAdvance', 'upperBestOf', 'lowerBestOf', 'finalBestOf'],
    stages: (o) => [
      {
        name: 'Fase de grupos',
        stage_type: 'round_robin',
        best_of: o.bestOf,
        number_of_groups: o.groups,
        advance_per_group: o.advance,
        lower_advance_per_group: o.lowerAdvance,
      },
      {
        name: 'Playoffs',
        stage_type: 'double_elimination',
        best_of: o.upperBestOf,
        lower_best_of: o.lowerBestOf,
        final_best_of: o.finalBestOf,
      },
    ],
  },
  {
    id: 'points',
    title: 'Por puntos',
    description: 'Sin enfrentamientos 1 vs 1: todos juegan la misma partida a la vez y suman puntos. Gana el que más sume.',
    example: 'Ej. Left 4 Dead o battle royale: 3 partidas, ranking por puntos.',
    icon: <Ranking size={22} />,
    fields: ['ffaRounds'],
    stages: (o) => [{ name: 'Partidas por puntos', stage_type: 'free_for_all', ffa_rounds: o.ffaRounds }],
  },
]

const FIELD_LABELS: Record<keyof FormatOptions, { label: string; hint?: string }> = {
  bestOf: { label: 'Bo de cada match', hint: '1 = una sola partida.' },
  upperBestOf: { label: 'Bo del upper' },
  lowerBestOf: { label: 'Bo del lower' },
  lowerAdvance: { label: 'Pasan al lower por grupo', hint: 'Los que siguen en la tabla.' },
  finalBestOf: { label: 'Bo de la final', hint: 'Normalmente 3 o 5.' },
  groups: { label: 'Número de grupos' },
  advance: { label: 'Pasan por grupo', hint: 'A los playoffs (al upper en doble eliminación).' },
  thirdPlace: { label: 'Match por el tercer lugar' },
  ffaRounds: { label: 'Partidas', hint: 'Cuántas partidas juegan todos.' },
}

export function FormatWizard({
  tournament,
  onClose,
  onCustom,
  onCreated,
}: {
  tournament: Tournament
  onClose: () => void
  /** Opens the detailed form to build the format by hand. */
  onCustom: () => void
  onCreated: (stage: Stage) => void
}) {
  const participants = useParticipants(tournament.id)
  const teams = participants.data?.length ?? 0
  // Without a power of two an elimination bracket would need byes, so the
  // league with a final is recommended instead.
  const bracketFits = isPowerOfTwo(teams)
  const [chosen, setChosen] = useState<string | null>(null)
  const selected = chosen ?? (teams > 0 && !bracketFits ? 'league-final' : TEMPLATES[0].id)
  const setSelected = setChosen
  const [options, setOptions] = useState<FormatOptions>({
    bestOf: 1,
    finalBestOf: 3,
    groups: 2,
    advance: 2,
    thirdPlace: false,
    ffaRounds: 3,
    lowerAdvance: 2,
    upperBestOf: 1,
    lowerBestOf: 1,
  })
  const template = TEMPLATES.find((t) => t.id === selected)!
  const qualifiers = options.groups * options.advance
  const lowerQualifiers = options.groups * options.lowerAdvance
  const warning =
    selected === 'elimination' && teams > 0 && !bracketFits
      ? `Con ${teams} equipos confirmados habría pases directos. La eliminación directa necesita 2, 4, 8, 16 o 32: usa Liga + final o ajusta los participantes antes del sorteo.`
      : selected === 'groups-playoffs' && !isPowerOfTwo(qualifiers)
        ? `Pasarían ${qualifiers} equipos a los playoffs: deben ser 2, 4, 8 o 16 para que no haya pases directos.`
        : selected === 'groups-playoffs' && teams > 0 && options.groups * 2 > teams
          ? `Con ${teams} equipos no alcanzan para ${options.groups} grupos (mínimo 2 por grupo).`
          : selected === 'double' && teams > 0 && (!bracketFits || teams < 4)
            ? `La doble eliminación necesita 4, 8, 16 o 32 equipos y hay ${teams}. Usa Grupos + doble eliminación o ajusta los participantes.`
            : selected === 'groups-double' && !isPowerOfTwo(qualifiers)
              ? `Al upper pasarían ${qualifiers}: deben ser 2, 4, 8 o 16.`
              : selected === 'groups-double' && lowerQualifiers !== qualifiers && lowerQualifiers !== qualifiers / 2
                ? `Al lower pasarían ${lowerQualifiers}: deben ser los mismos que en upper (${qualifiers}) o la mitad (${qualifiers / 2}).`
                : selected === 'groups-double' && teams > 0 && qualifiers + lowerQualifiers > teams
                  ? `Pasarían ${qualifiers + lowerQualifiers} equipos y solo hay ${teams} confirmados.`
                  : null
  const set = <K extends keyof FormatOptions>(field: K, value: FormatOptions[K]) =>
    setOptions((current) => ({ ...current, [field]: value }))

  const create = useApiMutation({
    request: async () => {
      const created: Stage[] = []
      const drafts = template.stages(options)
      for (const [index, draft] of drafts.entries()) {
        created.push(
          await api<Stage>('stages/', { method: 'POST', body: { ...draft, order: index + 1, tournament: tournament.id } }),
        )
      }
      return created
    },
    invalidate: [['stages', tournament.id], ['tournament', tournament.id]],
    success: 'Formato creado. Ahora realiza el sorteo.',
    onSuccess: (stages) => {
      onCreated(stages[0])
      onClose()
    },
  })

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Formato del torneo"
      description="Elige cómo se juega. Después del sorteo podrás ver las llaves o la tabla antes de confirmar."
      footer={
        <>
          <Button variant="ghost" icon={<SlidersHorizontal size={16} />} onClick={onCustom}>
            Personalizado
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Crear formato
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <p className="rounded-xl border border-white/[0.06] bg-ink-850 px-4 py-3 text-sm text-ink-300">
          {teams > 0 ? (
            <>
              Hay <strong className="text-ink-100">{teams}</strong> participantes confirmados.{' '}
              {bracketFits
                ? 'Es una cantidad exacta para un bracket de eliminación directa.'
                : 'No es 2, 4, 8, 16 o 32, así que te recomendamos Liga + final.'}
            </>
          ) : (
            'Aún no hay participantes confirmados. Recuerda: la eliminación directa necesita 2, 4, 8, 16 o 32 al momento del sorteo.'
          )}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((item) => {
            const active = item.id === selected
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className={cx(
                  'relative flex gap-3 rounded-xl border p-4 text-left transition',
                  active ? 'border-accent bg-accent-soft' : 'border-white/[0.08] hover:border-white/20',
                )}
              >
                <span
                  className={cx(
                    'grid size-10 shrink-0 place-items-center rounded-lg',
                    active ? 'bg-accent text-accent-ink' : 'bg-ink-800 text-ink-300',
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-400">{item.description}</span>
                  <span className="mt-1.5 block text-xs text-ink-300">{item.example}</span>
                  {item.id === 'elimination' && teams > 0 && !bracketFits && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-warn">
                      <Warning size={12} weight="fill" /> No recomendado con {teams} equipos
                    </span>
                  )}
                  {item.id === 'league-final' && teams > 0 && !bracketFits && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-win">
                      <Check size={12} weight="bold" /> Recomendado
                    </span>
                  )}
                </span>
                {active && <Check size={16} weight="bold" className="absolute right-3 top-3 text-accent" />}
              </button>
            )
          })}
        </div>

        <div className="rounded-xl border border-white/[0.06] p-4">
          <p className="mb-4 text-sm font-semibold">Ajustes de “{template.title}”</p>
          <div className="grid gap-5 sm:grid-cols-3">
            {template.fields.map((field) =>
              field === 'thirdPlace' ? (
                <label key={field} className="flex items-center justify-between gap-3 sm:col-span-3">
                  <span className="text-sm">{FIELD_LABELS[field].label}</span>
                  <Toggle checked={options.thirdPlace} onChange={(v) => set('thirdPlace', v)} label={FIELD_LABELS[field].label} />
                </label>
              ) : (
                <Field
                  key={field}
                  label={
                    field === 'finalBestOf' && selected.includes('double')
                      ? 'Bo de la gran final'
                      : field === 'bestOf' && selected.startsWith('groups')
                        ? 'Bo de los grupos'
                        : FIELD_LABELS[field].label
                  }
                  hint={FIELD_LABELS[field].hint}
                >
                  {(id) => (
                    <NumberInput id={id} min={1} value={options[field] as number} onValueChange={(v) => set(field, v)} />
                  )}
                </Field>
              ),
            )}
          </div>
          {warning && (
            <p className="mt-4 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              <Warning size={16} weight="fill" className="mt-0.5 shrink-0" /> {warning}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
