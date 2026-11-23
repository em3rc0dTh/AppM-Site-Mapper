/**
 * Read-only electrical presentation for the detached connection diagram.
 * Sum only distinct breaker readings; never sum voltage.
 *
 * A/B are source feeds. The combined current is the sum of the breaker
 * measurements, not an independently measured equipment current.
 */
export interface ElectricalSample {
  readonly voltageV?: number;
  readonly currentA?: number;
  readonly powerW?: number;
  readonly energyKwh?: number;
}

export interface AggregateSample {
  readonly value?: number;
  readonly reporting: number;
}

export interface ConnectionElectricalSummary {
  readonly breakerCount: number;
  readonly voltage: string;
  readonly current: AggregateSample;
  readonly power: AggregateSample;
  readonly energy: AggregateSample;
}

function sumDefined(values: readonly (number | undefined)[]): AggregateSample {
  const defined = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  return {
    ...(defined.length ? { value: defined.reduce((sum, value) => sum + value, 0) } : {}),
    reporting: defined.length,
  };
}

export function electricalSummary(
  connections: readonly { readonly breakerId: string }[],
  telemetry: Readonly<Record<string, ElectricalSample>>,
): ConnectionElectricalSummary {
  const breakerIds = [...new Set(connections.map((connection) => connection.breakerId))];
  const readings = breakerIds.map((id) => telemetry[id]);
  const voltages = readings
    .map((reading) => reading?.voltageV)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const min = Math.min(...voltages);
  const max = Math.max(...voltages);
  const voltage = voltages.length
    ? `${min.toFixed(1)}${min === max ? '' : '–' + max.toFixed(1)} V${voltages.length < breakerIds.length ? ' *' : ''}`
    : '—';

  return {
    breakerCount: breakerIds.length,
    voltage,
    current: sumDefined(readings.map((reading) => reading?.currentA)),
    power: sumDefined(readings.map((reading) => reading?.powerW)),
    energy: sumDefined(readings.map((reading) => reading?.energyKwh)),
  };
}

/** An asterisk signals a partial sum, never a fully measured total. */
export function summaryValue(
  sample: AggregateSample,
  breakerCount: number,
  decimals: number,
  unit: string,
  scale = 1,
): string {
  if (sample.value === undefined) return '—';
  return `${(sample.value / scale).toFixed(decimals)} ${unit}${sample.reporting < breakerCount ? ' *' : ''}`;
}
