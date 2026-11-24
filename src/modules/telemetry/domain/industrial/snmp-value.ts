/** Interpret printable SNMP OCTET STRING text without altering the stored RAW evidence. */
export function decodeSnmpText(value: unknown): string | null {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (
    value && typeof value === 'object' &&
    'encoding' in value && value.encoding === 'base64' &&
    'bytes' in value && typeof value.bytes === 'string' &&
    value.bytes.length <= 8192
  ) {
    try {
      const bytes = Uint8Array.from(atob(value.bytes), (c) => c.charCodeAt(0));
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (Array.from(text).some((c) => {
    const n = c.codePointAt(0)!;
    return n < 32 || (n >= 127 && n < 160);
  })) return null;
  return text.trim() || null;
}

export function stringifySnmpRaw(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value) ?? '—';
  } catch {
    return '—';
  }
}
