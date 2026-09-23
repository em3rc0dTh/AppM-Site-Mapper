import { requirePermission } from '@/modules/identity/application/current-session';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

function event(name: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET() {
  const auth = await requirePermission('telemetry:read');

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  const telemetry = await getTelemetryRuntime();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event('snapshot', telemetry.service.snapshot()));

      unsubscribe = telemetry.hub.subscribe((sample) => {
        try {
          controller.enqueue(event('telemetry', sample));
        } catch {
          unsubscribe?.();
          unsubscribe = null;
        }
      });

      if (!unsubscribe) {
        controller.enqueue(event('error', { code: 'STREAM_LIMIT_REACHED' }));
        controller.close();
        return;
      }

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
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
