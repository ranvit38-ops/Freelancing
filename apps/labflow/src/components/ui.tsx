import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/*
 * One small set of primitives shared by every screen. Kept in a single file on
 * purpose — a dozen one-component files buys nothing at this size.
 */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ── buttons & links ────────────────────────────────────────────────────── */

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap';

const buttonTone: Record<ButtonTone, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90',
  secondary: 'border border-line bg-surface text-fg hover:bg-raised',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
  danger: 'border border-line bg-surface text-danger hover:bg-danger/5',
};

const buttonSize = { sm: 'h-8 px-3', md: 'h-9 px-4' };

export function Button({
  tone = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { tone?: ButtonTone; size?: keyof typeof buttonSize }) {
  return (
    <button
      {...props}
      className={cx(buttonBase, buttonTone[tone], buttonSize[size], className)}
    />
  );
}

export function ButtonLink({
  tone = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: keyof typeof buttonSize }) {
  return (
    <Link {...props} className={cx(buttonBase, buttonTone[tone], buttonSize[size], className)} />
  );
}

/* ── surfaces ───────────────────────────────────────────────────────────── */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cx('rounded-xl border border-line bg-surface shadow-card', className)}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-subtle">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/* ── form controls ──────────────────────────────────────────────────────── */

const fieldBase =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg ' +
  'placeholder:text-subtle focus:border-accent focus-visible:outline-none ' +
  'focus:ring-2 focus:ring-accent/25 disabled:bg-raised';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(fieldBase, 'h-9 py-0', className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(fieldBase, 'min-h-[88px] leading-6', className)} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(fieldBase, 'h-9 py-0 pr-8', className)} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium">
        {label}
        {optional ? <span className="text-xs font-normal text-subtle">optional</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}

/* ── status & badges ────────────────────────────────────────────────────── */

const badgeTone = {
  neutral: 'border-line bg-raised text-muted',
  accent: 'border-accent/20 bg-accent-soft text-accent',
  ok: 'border-ok/20 bg-ok/10 text-ok',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  danger: 'border-danger/20 bg-danger/10 text-danger',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof badgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        badgeTone[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ── empty states ───────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

/* ── layout helpers ─────────────────────────────────────────────────────── */

export function DefinitionList({
  items,
}: {
  items: { term: ReactNode; value: ReactNode }[];
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wider text-subtle">{item.term}</dt>
          <dd className="mt-1 text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Renders researcher-written prose with its line breaks intact. */
export function Prose({ text }: { text: string | null }) {
  if (!text?.trim()) return <span className="text-subtle">Not recorded</span>;
  return <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>;
}
