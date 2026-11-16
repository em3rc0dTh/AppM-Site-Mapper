import Link from 'next/link';
import type { ReactNode, HTMLAttributes } from 'react';

export function Icon({ name = 'box' }: { name?: string }) {
  const paths: Record<string, string> = {
    workspace: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    network: 'M9 3h6v6H9z M3 15h6v6H3z M15 15h6v6h-6z M12 9v3 M6 15v-3h12v3',
    power: 'M13 2 4 14h7l-1 8 10-13h-7z',
    telemetry: 'M2 12h4l3-8 6 16 3-8h4',
    settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
    box: 'M4 5h16v14H4z M4 10h16 M8 14h2 M8 16h2',
    room: 'M3 3h18v18H3z M3 15h6v6 M15 3v6h6',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.box} />
    </svg>
  );
}

export function Surface({
  variant = 'default',
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  variant?: 'default' | 'raised' | 'interactive' | 'inset' | 'danger';
}) {
  return <section className={`surface surface--${variant} ${className}`} {...props} />;
}
export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="section-description">{description}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </header>
  );
}
export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function MetricTile({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: string;
}) {
  return (
    <Surface className="metric-tile">
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {detail && <span className="metric-detail">{detail}</span>}
    </Surface>
  );
}
export function EntityRow({
  name,
  kind,
  metadata,
  href,
  actions,
  status,
}: {
  name: string;
  kind: string;
  metadata?: string;
  href?: string;
  actions?: ReactNode;
  status?: ReactNode;
}) {
  const content = (
    <>
      <span className="entity-icon">
        <Icon name={kind === 'NETWORK' ? 'network' : kind.includes('ROOM') ? 'room' : 'box'} />
      </span>
      <span className="entity-copy">
        <small>{kind.replaceAll('_', ' ')}</small>
        <strong>{name}</strong>
        {metadata && <span>{metadata}</span>}
      </span>
    </>
  );
  return (
    <div className="entity-row">
      {href ? (
        <Link className="entity-main" href={href}>
          {content}
        </Link>
      ) : (
        <div className="entity-main">{content}</div>
      )}
      <div className="entity-actions">
        {status}
        {actions}
      </div>
    </div>
  );
}
export function DataView({
  children,
  mode = 'list',
  label,
}: {
  children: ReactNode;
  mode?: 'list' | 'grid' | 'table';
  label: string;
}) {
  return (
    <div
      className={`data-view data-view--${mode}`}
      role="region"
      aria-label={label}
      tabIndex={mode === 'table' ? 0 : undefined}
    >
      {children}
    </div>
  );
}
export function StatePanel({
  title,
  description,
  kind = 'empty',
  action,
}: {
  title: string;
  description?: string;
  kind?:
    | 'empty'
    | 'loading'
    | 'error'
    | 'forbidden'
    | 'disconnected'
    | 'reconnecting'
    | 'archived'
    | 'readonly';
  action?: ReactNode;
}) {
  return (
    <div
      className={`state-panel state-panel--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span className="state-symbol">
        <Icon name={kind === 'disconnected' ? 'telemetry' : 'box'} />
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
