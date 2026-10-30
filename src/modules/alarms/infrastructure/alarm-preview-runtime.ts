import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

interface PreviewAck {
  readonly acknowledgedAt: string;
}

function state(): Map<string, PreviewAck> {
  return getProcessSingleton('alarm-preview-ack-state', () => new Map<string, PreviewAck>());
}

export function previewAcknowledgement(alarmId: string): PreviewAck | null {
  return state().get(alarmId) ?? null;
}

export function acknowledgePreviewAlarm(alarmId: string): PreviewAck {
  const existing = state().get(alarmId);
  if (existing) return existing;
  const value = { acknowledgedAt: new Date().toISOString() };
  state().set(alarmId, value);
  return value;
}
