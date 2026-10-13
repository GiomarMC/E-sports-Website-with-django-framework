import { Broadcast } from '@phosphor-icons/react'
import { useState } from 'react'
import { StreamEmbed } from '../../components/tournament'
import { Badge, cx, EmptyState, Skeleton } from '../../components/ui'
import { platformLabel } from '../../lib/format'
import { useGames, useSettings, useStreams } from '../../lib/queries'
import { detectPlatform } from '../../lib/streams'
import type { Stream } from '../../lib/types'

export default function LivePage() {
  const streams = useStreams()
  const games = useGames()
  const { data: settings } = useSettings()
  const [selected, setSelected] = useState<number | null>(null)

  const list: Stream[] = [...(streams.data ?? [])]
  if (settings?.main_stream_url && !list.some((s) => s.url === settings.main_stream_url)) {
    list.push({
      id: -1,
      title: `Canal oficial de ${settings.event_name}`,
      platform: detectPlatform(settings.main_stream_url),
      url: settings.main_stream_url,
      game: null,
      match: null,
      is_live: false,
      created_at: '',
    })
  }
  const current = list.find((s) => s.id === selected) ?? list[0]

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">En vivo</h1>
      <p className="mt-2 text-ink-400">Transmisiones oficiales de Twitch, Kick y YouTube.</p>

      <div className="mt-10">
        {streams.isPending ? (
          <Skeleton className="aspect-video" />
        ) : !current ? (
          <EmptyState
            icon={<Broadcast size={24} />}
            title="No hay transmisiones ahora"
            description="Cuando empiece un match transmitido aparecerá aquí automáticamente."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <StreamEmbed stream={current} />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {current.is_live && <Badge tone="live">En vivo</Badge>}
                <h2 className="font-display text-2xl font-semibold">{current.title}</h2>
                <a href={current.url} target="_blank" rel="noreferrer" className="text-sm text-ink-400 hover:text-ink-100">
                  Abrir en {platformLabel[current.platform]}
                </a>
              </div>
            </div>
            <div className="space-y-2">
              {list.map((stream) => (
                <button
                  key={stream.id}
                  onClick={() => setSelected(stream.id)}
                  className={cx(
                    'surface flex w-full flex-col gap-1 p-4 text-left transition hover:border-white/15',
                    stream.id === current.id && 'border-accent/40',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{stream.title}</span>
                    {stream.is_live ? <Badge tone="live">Vivo</Badge> : <Badge>{platformLabel[stream.platform]}</Badge>}
                  </span>
                  {stream.game && (
                    <span className="text-xs text-ink-400">{games.data?.find((g) => g.id === stream.game)?.name}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
