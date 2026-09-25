import {
  authorizeSessionToken,
  getCurrentSessionToken,
} from '@/modules/identity/application/current-session';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 15_000;
const SESSION_REVALIDATION_INTERVAL_MS = 30_000;
const encoder = new TextEncoder();

function event(name: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET() {
  const token = await getCurrentSessionToken();

  if (!token) {
    return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
  }

  const auth = await authorizeSessionToken(token, 'telemetry:read');

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  const telemetry = await getTelemetryRuntime();
  const initialSnapshot = await telemetry.service.snapshot();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let sessionRevalidation: ReturnType<typeof setInterval> | null = null;
  let sessionRevalidationInFlight = false;
  let closed = false;

  function cleanup() {
    unsubscribe?.();
    unsubscribe = null;

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    if (sessionRevalidation) {
      clearInterval(sessionRevalidation);
      sessionRevalidation = null;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = (code: string) => {
        if (closed) return;

        closed = true;

        try {
          controller.enqueue(event('session', { code }));
        } catch {
          // The client may already have disconnected.
        }

        cleanup();

        try {
          controller.close();
        } catch {
          // The stream may already be closed by the runtime.
        }
      };

      controller.enqueue(event('snapshot', initialSnapshot));

      unsubscribe = telemetry.hub.subscribe((sample) => {
        if (closed) return;

        try {
          controller.enqueue(event('telemetry', sample));
        } catch {
          closed = true;
          cleanup();
        }
      });

      if (!unsubscribe) {
        controller.enqueue(event('error', { code: 'STREAM_LIMIT_REACHED' }));
        closed = true;
        cleanup();
        controller.close();
        return;
      }

      heartbeat = setInterval(() => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
          cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);

      sessionRevalidation = setInterval(() => {
        if (closed || sessionRevalidationInFlight) return;

        sessionRevalidationInFlight = true;

        void authorizeSessionToken(token, 'telemetry:read')
          .then((result) => {
            if (!result.ok) {
              close(result.error);
            }
          })
          .catch(() => {
            close('SESSION_REVALIDATION_FAILED');
          })
          .finally(() => {
            sessionRevalidationInFlight = false;
          });
      }, SESSION_REVALIDATION_INTERVAL_MS);
    },
    cancel() {
      closed = true;
      cleanup();
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
