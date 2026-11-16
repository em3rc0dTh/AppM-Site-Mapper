import { describe, expect, it } from 'vitest';

import {
  encodeConnect,
  encodeSubscribe,
  extractPackets,
  parsePublish,
} from '@/modules/telemetry/infrastructure/mqtt-protocol';

describe('mqtt protocol', () => {
  it('encodes CONNECT and SUBSCRIBE frames', () => {
    expect(encodeConnect({ clientId: 'test', keepAliveSeconds: 30 })[0]).toBe(0x10);
    expect(encodeSubscribe(1, 'data/dev/#')[0]).toBe(0x82);
  });

  it('extracts and parses a QoS0 PUBLISH packet', () => {
    const topic = new TextEncoder().encode('data/dev/SN-1');
    const payload = new TextEncoder().encode('{"reported":{"rpm":800}}');
    const body = new Uint8Array(2 + topic.length + payload.length);
    body[0] = (topic.length >> 8) & 0xff;
    body[1] = topic.length & 0xff;
    body.set(topic, 2);
    body.set(payload, 2 + topic.length);

    const packet = new Uint8Array([0x30, body.length, ...body]);
    const parsed = extractPackets(packet);

    expect(parsed.remainder.length).toBe(0);
    expect(parsed.packets).toHaveLength(1);

    const publish = parsePublish(parsed.packets[0]!);
    expect(publish.topic).toBe('data/dev/SN-1');
    expect(new TextDecoder().decode(publish.payload)).toContain('"rpm":800');
    expect(publish.qos).toBe(0);
  });
});
