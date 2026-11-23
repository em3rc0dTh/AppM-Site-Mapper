/** Read-only presentation of raw SmartPack2 controller signals. No feed/shunt inference. */
export const ELTEK_SMARTPACK_SOURCE = 'ELTEK-SMARTPACK2-LURIN-REAL';
export const ELTEK_SMARTPACK_OIDS = {
  system: '1.3.6.1.4.1.12148.10.2.1.0',
  current: '1.3.6.1.4.1.12148.10.9.2.5.0',
  battery: '1.3.6.1.4.1.12148.10.10.5.5.0',
} as const;
export const ELTEK_MAX_AGE_MS = 130_000;

export type EltekSignal = {
  key: string;
  rawValue: unknown;
  value: number | string | boolean | null;
  quality: string;
  receivedAt: string;
};

const SYSTEM_STATUS: Readonly<Record<number, string>> = {
  0: 'Error', 1: 'Normal', 2: 'Alarma menor', 3: 'Alarma mayor',
  4: 'Deshabilitado', 5: 'Desconectado', 6: 'No presente',
  7: 'Alarma menor y mayor', 8: 'Mayor baja', 9: 'Menor baja',
  10: 'Mayor alta', 11: 'Menor alta', 12: 'Evento',
  13: 'Valor de voltaje', 14: 'Valor de corriente', 15: 'Valor de temperatura',
  16: 'Valor de unidad', 17: 'Valor porcentual', 18: 'Crítico', 19: 'Advertencia',
};

export type EltekReading = {
  text: string;
  raw: string;
  receivedAt: string | null;
  state: 'RECENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID';
  quality: string;
};

export function presentEltekReading(
  signal: EltekSignal | undefined,
  nowMs: number,
  kind: keyof typeof ELTEK_SMARTPACK_OIDS,
): EltekReading {
  const raw = signal?.rawValue ?? signal?.value;
  const primitive = typeof raw === 'string' || typeof raw === 'number';
  const value = primitive && String(raw).trim() !== '' ? String(raw) : '—';
  const received = signal?.receivedAt ?? null;
  const parsed = received ? Date.parse(received) : NaN;
  const validTimestamp = Number.isFinite(parsed) && parsed <= nowMs + 10_000;
  const age = validTimestamp ? nowMs - parsed : Infinity;
  const state = !signal ? 'UNAVAILABLE'
    : !validTimestamp || value === '—' ? 'INVALID'
      : age > ELTEK_MAX_AGE_MS ? 'STALE' : 'RECENT';

  let text = value;
  if (kind === 'system' && value !== '—') {
    const numeric = Number(value);
    text = Number.isInteger(numeric) && Object.hasOwn(SYSTEM_STATUS, numeric)
      ? SYSTEM_STATUS[numeric]! + ' (' + value + ')'
      : 'Estado desconocido (' + value + ')';
  }
  return { text, raw: value, receivedAt: validTimestamp ? received : null,
    state, quality: signal?.quality ?? 'UNKNOWN' };
}
