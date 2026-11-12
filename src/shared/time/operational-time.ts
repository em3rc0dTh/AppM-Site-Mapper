export const TELXIUS_LURIN_TIME_ZONE = 'America/Lima' as const;

export interface OperationalTimestamp {
  readonly display: string;
  readonly local: string;
  readonly offset: string;
  readonly utc: string;
  readonly audit: string;
}

/**
 * Operational screens use the site's local civil time while preserving the
 * authoritative UTC instant for machine-readable/audit use.
 */
export function formatOperationalTimestamp(
  value: string | null | undefined,
  timeZone: string = TELXIUS_LURIN_TIME_ZONE,
): OperationalTimestamp | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  const display = `${part('hour')}:${part('minute')}:${part('second')}`;
  const local = `${part('year')}-${part('month')}-${part('day')} ${display}`;
  const zoneName =
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .find((item) => item.type === 'timeZoneName')?.value ?? timeZone;
  const offset = zoneName.replace(/^GMT/, 'UTC');
  const utc = date.toISOString();

  return {
    display,
    local,
    offset,
    utc,
    audit: `Local ${local} · ${timeZone} (${offset}) · UTC ${utc}`,
  };
}
