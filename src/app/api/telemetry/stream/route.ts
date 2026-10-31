import { cookies } from 'next/headers';
import { AuthService } from '@/modules/identity/application/auth-service';
import { AUTH_COOKIE_NAME } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const encoder = new TextEncoder();
function event(name: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
  const identity = await getIdentityRuntime();
  const auth = new AuthService(identity.repository, identity.throttle);
  if (!(await auth.authorize(token, 'telemetry:read')).ok)
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  const telemetry = await getTelemetryRuntime();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let draining = false;
  const pending = new Map<string, { name: string; data: unknown }>();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
    try {
      controllerRef?.close();
    } catch {
      /* Consumer already cancelled. */
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const drain = async () => {
        if (closed || draining) return;
        draining = true;
        try {
          while (!closed && pending.size) {
            const first = pending.entries().next().value as
              | [string, { name: string; data: unknown }]
              | undefined;
            if (!first) break;
            const [key, item] = first;
            pending.delete(key);
            // Re-read session and user for every delivery; no cached role authority.
            if (!(await auth.authorize(token, 'telemetry:read')).ok) {
              close();
              return;
            }
            if (!closed) controller.enqueue(event(item.name, item.data));
          }
        } catch {
          close();
        } finally {
          draining = false;
          if (!closed && pending.size) void drain();
        }
      };
      const send = (name: string, data: unknown, key: string) => {
        if (closed) return;
        // Replace queued stale data for the same logical stream instead of
        // silently dropping it or allowing an unbounded backlog.
        pending.set(key, { name, data });
        void drain();
      };
      unsubscribe = telemetry.hub.subscribe((sample) => {
        const key = [
          sample.targetType,
          sample.targetId,
          sample.sourceIdentity,
          sample.sourcePointId ?? '',
          sample.bindingId,
        ].join('|');
        send('telemetry', sample, 'telemetry:' + key);
      });
      if (!unsubscribe) {
        controller.enqueue(event('error', { code: 'STREAM_LIMIT_REACHED' }));
        close();
        return;
      }
      send('snapshot', telemetry.service.snapshot(), 'snapshot');
      // A bounded snapshot refresh repairs any client-side gap after reconnects.
      heartbeat = setInterval(() => {
        send('snapshot', telemetry.service.snapshot(), 'snapshot');
      }, 15_000);
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
