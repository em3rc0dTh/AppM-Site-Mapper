import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Telemetry SSE server clock contract', () => {
  it('publishes a server clock reference before/with telemetry snapshots', () => {
    const route = source('src/app/api/telemetry/stream/route.ts');

    expect(route).toContain("send('clock', { serverNow: new Date().toISOString() }, 'clock')");
    expect(route).toContain("send('snapshot', telemetry.service.snapshot(), 'snapshot')");
  });

  it('evaluates browser freshness using the server clock offset', () => {
    const hook = source('src/components/telemetry/use-bdfb-telemetry.ts');

    expect(hook).toContain('const serverClockOffsetMs = useRef(0)');
    expect(hook).toContain("stream.addEventListener('clock', serverClock as EventListener)");
    expect(hook).toContain('serverClockOffsetMs.current = serverNow - Date.now()');
    expect(hook).toContain('setNow(Date.now() + serverClockOffsetMs.current)');
  });
});
