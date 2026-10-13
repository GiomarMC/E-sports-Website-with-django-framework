import { CircleNotch, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { initials } from '../lib/format'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// ------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  secondary: 'bg-ink-800 text-ink-100 border border-white/[0.08] hover:bg-ink-700',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-white/[0.05]',
  danger: 'bg-accent-soft text-accent border border-accent/30 hover:bg-accent hover:text-accent-ink',
  success: 'bg-win-soft text-win border border-win/30 hover:bg-win hover:text-ink-950',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-xl font-medium',
        'transition duration-200 ease-out-expo active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <CircleNotch size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

// --------------------------------------------------------------- badges

type Tone = 'neutral' | 'accent' | 'win' | 'warn' | 'live'

const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-ink-300',
  accent: 'bg-accent-soft text-accent',
  win: 'bg-win-soft text-win',
  warn: 'bg-warn-soft text-warn',
  live: 'bg-live/15 text-live',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {tone === 'live' && <LiveDot />}
      {children}
    </span>
  )
}

export function LiveDot() {
  return (
    <span
      className="inline-block size-1.5 rounded-full bg-live"
      style={{ animation: 'live-pulse 1.6s ease-in-out infinite' }}
    />
  )
}

// ---------------------------------------------------------------- forms

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: (id: string) => ReactNode
  className?: string
}

export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-300">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-accent">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

const inputBase =
  'w-full rounded-xl border bg-ink-850 px-3.5 text-sm text-ink-100 placeholder:text-ink-600 transition ' +
  'focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60'

export function Input({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cx(inputBase, 'h-11', invalid ? 'border-accent/60' : 'border-white/[0.08]', className)}
      {...props}
    />
  )
}

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (value: number) => void
  invalid?: boolean
}

/** Numeric input that keeps what the user types (so "0" can be replaced or
 * cleared) and reports a number only when the text is a valid number. */
export function NumberInput({ value, onValueChange, onBlur, onFocus, ...props }: NumberInputProps) {
  const [text, setText] = useState(String(value))
  const [previous, setPrevious] = useState(value)
  if (value !== previous) {
    // The parent changed the value (e.g. reset): show it unless it is what
    // the user is already typing.
    setPrevious(value)
    if (Number(text) !== value) setText(String(value))
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      value={text}
      onFocus={(event) => {
        event.target.select()
        onFocus?.(event)
      }}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        if (next.trim() !== '' && !Number.isNaN(Number(next))) onValueChange(Number(next))
      }}
      onBlur={(event) => {
        if (text.trim() === '' || Number.isNaN(Number(text))) setText(String(value))
        onBlur?.(event)
      }}
      {...props}
    />
  )
}

export function Textarea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cx(inputBase, 'min-h-28 py-3 leading-relaxed', invalid ? 'border-accent/60' : 'border-white/[0.08]', className)}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, 'h-11 border-white/[0.08] pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50',
        checked ? 'bg-win' : 'bg-ink-700',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cx('size-5 rounded-full bg-white shadow', checked ? 'ml-[22px]' : 'ml-0.5')}
      />
    </button>
  )
}

// ----------------------------------------------------- feedback states

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-white/[0.08] px-6 py-10 sm:items-center sm:text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-ink-800 text-ink-400">{icon}</div>
      <div>
        <p className="font-display text-lg font-semibold text-ink-100">{title}</p>
        {description && <p className="mt-1 max-w-[50ch] text-sm leading-relaxed text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-accent/20 bg-accent-soft px-5 py-4 text-sm text-ink-100 sm:flex-row sm:items-center sm:justify-between">
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}

// --------------------------------------------------------------- avatar

export function TeamLogo({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md bg-ink-700 font-display font-semibold text-ink-300"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials(name) || '?'}
    </span>
  )
}

// ---------------------------------------------------------------- modal

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ open, onClose, title, description, children, footer, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cx(
              'surface relative flex max-h-[92dvh] w-full flex-col rounded-b-none sm:rounded-2xl',
              wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
              <div>
                <h2 className="font-display text-xl font-semibold">{title}</h2>
                {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
              </div>
              <button onClick={onClose} className="text-ink-400 transition hover:text-ink-100" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <div className="scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] px-6 py-4 sm:flex-row sm:justify-end">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  loading,
  onConfirm,
  onClose,
  children,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-300">{description}</p>
      {children}
    </Modal>
  )
}

// ----------------------------------------------------------------- tabs

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
}: {
  tabs: { value: T; label: string; icon?: ReactNode; count?: number }[]
  value: T
  onChange: (value: T) => void
  layoutId: string
}) {
  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto px-4">
      <div role="tablist" className="flex w-max gap-1 rounded-2xl border border-white/[0.06] bg-ink-900 p-1">
        {tabs.map((tab) => {
          const active = tab.value === value
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={cx(
                'relative flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-medium transition',
                active ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100',
              )}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-ink-700"
                />
              )}
              <span className="relative flex items-center gap-2">
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="rounded-md bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ section

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        )}
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  )
}
