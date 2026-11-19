import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../../infra/integration/mqtt-publisher.sh', import.meta.url),
  'utf8',
);

describe('integration MQTT publisher timestamp contract', () => {
  it('timestamps every payload immediately before publish instead of once per cycle', () => {
    const cycle = source.indexOf('publish_cycle()');
    const serialLoop = source.indexOf('for serial in', cycle);
    const panelLoop = source.indexOf('for panel in', serialLoop);
    const epoch = source.indexOf('epoch="$(date +%s)"', panelLoop);
    const payload = source.indexOf('payload="', epoch);
    const publish = source.indexOf('mosquitto_pub', payload);

    expect(cycle).toBeGreaterThanOrEqual(0);
    expect(serialLoop).toBeGreaterThan(cycle);
    expect(panelLoop).toBeGreaterThan(serialLoop);
    expect(epoch).toBeGreaterThan(panelLoop);
    expect(payload).toBeGreaterThan(epoch);
    expect(publish).toBeGreaterThan(payload);

    expect(source.slice(cycle, serialLoop)).not.toContain('epoch="$(date +%s)"');
  });
});
