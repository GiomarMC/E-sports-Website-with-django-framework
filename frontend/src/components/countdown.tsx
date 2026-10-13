import { useQueryClient } from '@tanstack/react-query'
import { memo, useEffect, useRef } from 'react'
import { countdownParts, countdownText } from '../lib/countdown'
import { useNow } from '../lib/useNow'
import { cx } from './ui'

/** When a countdown reaches zero the registration state changes on the
 * server (it opens or closes), so the tournaments are fetched again. */
function useRefreshAt(target: string) {
  const queryClient = useQueryClient()
  const done = useRef(false)
  const now = useNow()
  const left = Date.parse(target) - now
  useEffect(() => {
    done.current = false
  }, [target])
  useEffect(() => {
    if (left > 0 || done.current) return
    done.current = true
    // A small delay so the server already sees the new state. No cleanup:
    // ``left`` changes every second and would cancel the timeout.
    window.setTimeout(() => {
      for (const key of [['tournaments'], ['tournament'], ['settings']]) queryClient.invalidateQueries({ queryKey: key })
    }, 1500)
  }, [left, queryClient])
  return left
}

const UNITS = [
  ['days', 'días'],
  ['hours', 'horas'],
  ['minutes', 'min'],
  ['seconds', 'seg'],
] as const

/** Big countdown with one tile per unit. */
export const Countdown = memo(function Countdown({ target, className }: { target: string; className?: string }) {
  const parts = countdownParts(useRefreshAt(target))
  return (
    <div className={cx('flex items-start gap-1.5 sm:gap-3', className)} role="timer" aria-live="off">
      {UNITS.map(([unit, label], index) => (
        <div key={unit} className="flex items-start gap-1.5 sm:gap-3">
          {index > 0 && <span className="pt-1.5 font-mono text-xl text-ink-600 sm:pt-3 sm:text-3xl">:</span>}
          <div className="flex flex-col items-center">
            <span className="min-w-[2ch] rounded-xl border border-white/[0.07] bg-ink-850 px-2 py-1.5 text-center font-mono text-2xl font-semibold tabular-nums text-ink-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-3.5 sm:py-2 sm:text-4xl">
              {String(parts[unit]).padStart(2, '0')}
            </span>
            <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
})

/** Inline countdown for lists: "3d 04:12:09". */
export const CountdownText = memo(function CountdownText({ target, className }: { target: string; className?: string }) {
  const left = useRefreshAt(target)
  return <span className={cx('font-mono tabular-nums', className)}>{countdownText(left)}</span>
})
