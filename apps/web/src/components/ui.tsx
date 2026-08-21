'use client'

import { useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'

function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const styles = {
    // Amarelo trigo com tinta grafite por cima: 7,5:1. Nunca texto branco aqui.
    primary: 'bg-brand-500 text-ink-900 hover:bg-brand-600 focus-visible:outline-ink-900',
    secondary:
      'bg-white text-ink-700 border border-border-strong hover:bg-ink-50 focus-visible:outline-ink-500',
    ghost: 'text-ink-600 hover:bg-ink-100 focus-visible:outline-ink-500',
    // Fundo no vermelho-escuro (8,2:1 com branco). O vermelho-china fica para
    // borda e destaque, onde nao carrega texto.
    danger: 'bg-danger-700 text-white hover:bg-danger-800 focus-visible:outline-danger-700',
  }[variant]

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        // min-h de 44px: alvo de toque recomendado no mobile.
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        styles,
        className,
      )}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
}

const fieldBase =
  'min-h-11 rounded-lg border bg-white px-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200'

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  hint?: string
  /**
   * Em campo de senha, oferece o botao "Mostrar". Digitar credencial as cegas e
   * a maior fonte de erro de digitacao — e o usuario ja esta com o valor a vista
   * na propria tela onde o configurou.
   */
  revealable?: boolean
}

export function Field({
  label,
  error,
  hint,
  id,
  className,
  revealable = false,
  type,
  ...rest
}: FieldProps) {
  const inputId = id ?? rest.name
  const [revelado, setRevelado] = useState(false)
  const podeRevelar = revealable && type === 'password'
  const tipoEfetivo = podeRevelar && revelado ? 'text' : type

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-700">
        {label}
      </label>

      <div className={podeRevelar ? 'relative' : undefined}>
        <input
          {...rest}
          type={tipoEfetivo}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cx(
            fieldBase,
            'w-full',
            podeRevelar && 'pr-20',
            error ? 'border-danger-500' : 'border-border-strong',
            className,
          )}
        />
        {podeRevelar && (
          <button
            type="button"
            onClick={() => setRevelado((valor) => !valor)}
            aria-pressed={revelado}
            className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-ink-600 hover:text-ink-900"
          >
            {revelado ? 'Ocultar' : 'Mostrar'}
          </button>
        )}
      </div>

      {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}
      {error && (
        <p id={`${inputId}-error`} className="text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: { value: string; label: string }[]
}

export function SelectField({ label, options, id, className, ...rest }: SelectFieldProps) {
  const selectId = id ?? rest.name
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      <select {...rest} id={selectId} className={cx(fieldBase, 'border-border-strong', className)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Card({
  children,
  className,
  title,
  actions,
}: {
  children: React.ReactNode
  className?: string
  /** Quando informado, renderiza o cabecalho do card com divisoria. */
  title?: string
  actions?: React.ReactNode
}) {
  return (
    <section
      className={cx('rounded-card border border-border-subtle bg-white shadow-card', className)}
    >
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

/** Card sem o padding interno, para lista que ocupa a largura toda. */
export function CardFlush({
  children,
  className,
  title,
  actions,
}: {
  children: React.ReactNode
  className?: string
  title?: string
  actions?: React.ReactNode
}) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded-card border border-border-subtle bg-white shadow-card',
        className,
      )}
    >
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success'
  children: React.ReactNode
}) {
  const styles =
    tone === 'error'
      ? 'bg-danger-50 text-danger-700 border-danger-500/40'
      : 'bg-success-50 text-success-600 border-success-600/30'

  return (
    <p role="alert" className={cx('rounded-lg border px-3 py-2 text-sm font-medium', styles)}>
      {children}
    </p>
  )
}

export function Badge({
  tone,
  children,
}: {
  tone: 'neutral' | 'brand' | 'success' | 'danger'
  children: React.ReactNode
}) {
  const styles = {
    neutral: 'bg-ink-100 text-ink-600 border-border-strong',
    // Badge amarelo com tinta escura: exatamente o uso do site institucional.
    brand: 'bg-brand-500 text-ink-900 border-brand-600',
    success: 'bg-success-50 text-success-600 border-success-600/30',
    danger: 'bg-danger-50 text-danger-700 border-danger-500/40',
  }[tone]

  return (
    <span
      className={cx('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', styles)}
    >
      {children}
    </span>
  )
}
