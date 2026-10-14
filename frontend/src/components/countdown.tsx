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

const SIZES = {
  md: {
    gap: 'gap-1.5 sm:gap-3',
    colon: 'pt-1.5 text-xl sm:pt-3 sm:text-3xl',
    tile: 'rounded-xl px-2 py-1.5 text-2xl sm:px-3.5 sm:py-2 sm:text-4xl',
    label: 'mt-1.5 text-[10px]',
  },
  lg: {
    gap: 'gap-1.5 sm:gap-3 xl:gap-4',
    colon: 'pt-2 text-2xl sm:pt-3 sm:text-4xl xl:pt-5 xl:text-5xl',
    tile: 'rounded-2xl px-2.5 py-2 text-3xl sm:px-4 sm:py-3 sm:text-5xl xl:px-5 xl:py-3.5 xl:text-6xl',
    label: 'mt-2 text-[10px] sm:text-xs',
  },
}

/** Big countdown with one tile per unit. */
export const Countdown = memo(function Countdown({
  target,
  size = 'md',
  className,
}: {
  target: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const parts = countdownParts(useRefreshAt(target))
  const s = SIZES[size]
  return (
    <div className={cx('flex items-start', s.gap, className)} role="timer" aria-live="off">
      {UNITS.map(([unit, label], index) => (
        <div key={unit} className={cx('flex items-start', s.gap)}>
          {index > 0 && <span className={cx('font-mono text-ink-600', s.colon)}>:</span>}
          <div className="flex flex-col items-center">
            <span
              className={cx(
                'min-w-[2ch] border border-white/[0.07] bg-ink-850 text-center font-mono font-semibold tabular-nums text-ink-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
                s.tile,
              )}
            >
              {String(parts[unit]).padStart(2, '0')}
            </span>
            <span className={cx('font-semibold uppercase tracking-[0.18em] text-ink-400', s.label)}>{label}</span>
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
