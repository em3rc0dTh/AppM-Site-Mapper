/** Display only: timestamps are stored unchanged in UTC/source format.
 * Operator-facing wall time uses the fixed site timezone, America/Lima.
 * Never reinterpret the source timestamp as local time or alter telemetry.
 */
export function formatEquipmentReadingTime(
  raw: string | undefined,
  locale: string,
): string | null {
  if (!raw) return null;
  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.getTime())) return null;

  return new Intl.DateTimeFormat(locale === 'es' ? 'es-PE' : 'en-US', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp);
}
