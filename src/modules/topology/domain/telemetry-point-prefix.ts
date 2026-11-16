/**
 * Operator-declared MQTT raw-point group for a positional Equipment.
 * Examples: 0_1, 0_2, bank_A. It is an address label, NOT an MQTT topic,
 * identity proof, or a physical circuit binding.
 */
export function normalizedTelemetryPointPrefix(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const prefix = value.trim();
  return prefix.length <= 80 && /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(prefix) ? prefix : null;
}

export function validTelemetryPointPrefix(value: string | null | undefined): boolean {
  return value == null || !value.trim() || normalizedTelemetryPointPrefix(value) !== null;
}

export function rawPointForPosition(prefix: string, position: number): string | null {
  if (
    !normalizedTelemetryPointPrefix(prefix) ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > 256
  )
    return null;
  return `${prefix}_${position}`;
}
