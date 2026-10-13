import { CalendarBlank } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { MatchCard } from '../../components/tournament'
import { cx, EmptyState, ErrorState, Skeleton, Tabs } from '../../components/ui'
import { formatDay } from '../../lib/format'
import { useGames, useMatches } from '../../lib/queries'
import { groupByDay } from '../../lib/tournament'

type View = 'proximos' | 'resultados'

export default function SchedulePage() {
  const games = useGames()
  const [view, setView] = useState<View>('proximos')
  const [game, setGame] = useState<number | null>(null)
  const matches = useMatches(
    view === 'proximos' ? { upcoming: true, game: game ?? undefined } : { status: 'completed', game: game ?? undefined },
  )

  const list = useMemo(() => {
    const data = [...(matches.data ?? [])]
    return view === 'resultados'
      ? data.sort((a, b) => (b.scheduled_at ?? b.updated_at).localeCompare(a.scheduled_at ?? a.updated_at))
      : data
  }, [matches.data, view])

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 md:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">Cronograma</h1>
      <p className="mt-2 text-ink-400">Fechas y resultados de todos los juegos. Se actualiza solo cada 30 segundos.</p>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Tabs
          layoutId="schedule-tabs"
          value={view}
          onChange={setView}
          tabs={[
            { value: 'proximos', label: 'Próximos' },
            { value: 'resultados', label: 'Resultados' },
          ]}
        />
        <div className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4">
          {[{ id: null, name: 'Todos' }, ...(games.data ?? [])].map((item) => (
            <button
              key={item.id ?? 'all'}
              onClick={() => setGame(item.id)}
              className={cx(
                'h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition',
                game === item.id
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-white/10 text-ink-300 hover:border-white/25 hover:text-ink-100',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        {matches.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : matches.isError ? (
          <ErrorState message={matches.error.message} onRetry={() => matches.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<CalendarBlank size={24} />}
            title={view === 'proximos' ? 'No hay matchs programados' : 'Todavía no hay resultados'}
            description="Revisa más tarde o elige otro juego."
          />
        ) : (
          <div className="space-y-10">
            {groupByDay(list).map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-3 font-display text-lg font-semibold capitalize text-ink-300">
                  {day === 'none' ? 'Sin fecha' : formatDay(items[0].scheduled_at!)}
                </h2>
                <div className="grid gap-3">
                  {items.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      gameName={games.data?.find((g) => g.id === match.game)?.name}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
