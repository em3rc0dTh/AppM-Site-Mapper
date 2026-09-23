export interface MqttConnectInput {
  readonly clientId: string;
  readonly username?: string;
  readonly password?: string;
  readonly keepAliveSeconds: number;
}

export interface MqttPublishPacket {
  readonly topic: string;
  readonly payload: Uint8Array;
  readonly qos: 0 | 1 | 2;
  readonly packetId?: number;
}

function encodeString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const output = new Uint8Array(encoded.length + 2);
  output[0] = (encoded.length >> 8) & 0xff;
  output[1] = encoded.length & 0xff;
  output.set(encoded, 2);
  return output;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

export function encodeRemainingLength(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0 || length > 268_435_455) {
    throw new Error('Invalid MQTT remaining length.');
  }

  const bytes: number[] = [];
  let value = length;

  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (value > 0);

  return Uint8Array.from(bytes);
}

function frame(header: number, body: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(header), encodeRemainingLength(body.length), body]);
}

export function encodeConnect(input: MqttConnectInput): Uint8Array {
  if (!input.clientId.trim()) {
    throw new Error('MQTT clientId is required.');
  }

  let flags = 0x02;
  if (input.username !== undefined) flags |= 0x80;
  if (input.password !== undefined) flags |= 0x40;

  const variableHeader = concat([
    encodeString('MQTT'),
    Uint8Array.of(0x04, flags, (input.keepAliveSeconds >> 8) & 0xff, input.keepAliveSeconds & 0xff),
  ]);

  const payload = concat([
    encodeString(input.clientId),
    ...(input.username === undefined ? [] : [encodeString(input.username)]),
    ...(input.password === undefined ? [] : [encodeString(input.password)]),
  ]);

  return frame(0x10, concat([variableHeader, payload]));
}

export function encodeSubscribe(packetId: number, topicFilter: string): Uint8Array {
  if (!Number.isInteger(packetId) || packetId < 1 || packetId > 65_535) {
    throw new Error('Invalid MQTT packet identifier.');
  }

  const body = concat([
    Uint8Array.of((packetId >> 8) & 0xff, packetId & 0xff),
    encodeString(topicFilter),
    Uint8Array.of(0x00),
  ]);

  return frame(0x82, body);
}

export function encodePingRequest(): Uint8Array {
  return Uint8Array.of(0xc0, 0x00);
}

export function encodePubAck(packetId: number): Uint8Array {
  return Uint8Array.of(0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff);
}

export interface ParsedMqttPacket {
  readonly type: number;
  readonly flags: number;
  readonly body: Uint8Array;
}

export function extractPackets(buffer: Uint8Array): Readonly<{
  packets: readonly ParsedMqttPacket[];
  remainder: Uint8Array;
}> {
  const packets: ParsedMqttPacket[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer.length - offset < 2) {
      break;
    }

    const first = buffer[offset];
    if (first === undefined) break;

    let multiplier = 1;
    let remainingLength = 0;
    let cursor = offset + 1;
    let encodedBytes = 0;

    while (true) {
      const byte = buffer[cursor];
      if (byte === undefined) {
        return { packets, remainder: buffer.slice(offset) };
      }

      remainingLength += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      cursor += 1;
      encodedBytes += 1;

      if ((byte & 0x80) === 0) {
        break;
      }

      if (encodedBytes >= 4) {
        throw new Error('Malformed MQTT remaining length.');
      }
    }

    const end = cursor + remainingLength;
    if (end > buffer.length) {
      break;
    }

    packets.push({
      type: first >> 4,
      flags: first & 0x0f,
      body: buffer.slice(cursor, end),
    });
    offset = end;
  }

  return { packets, remainder: buffer.slice(offset) };
}

export function parsePublish(packet: ParsedMqttPacket): MqttPublishPacket {
  if (packet.type !== 3 || packet.body.length < 2) {
    throw new Error('Not a valid MQTT PUBLISH packet.');
  }

  const topicLength = ((packet.body[0] ?? 0) << 8) | (packet.body[1] ?? 0);
  const topicEnd = 2 + topicLength;

  if (topicLength < 1 || topicEnd > packet.body.length) {
    throw new Error('Malformed MQTT PUBLISH topic.');
  }

  const topic = new TextDecoder().decode(packet.body.slice(2, topicEnd));
  const qos = ((packet.flags >> 1) & 0x03) as 0 | 1 | 2;
  let payloadOffset = topicEnd;
  let packetId: number | undefined;

  if (qos > 0) {
    if (payloadOffset + 2 > packet.body.length) {
      throw new Error('Malformed MQTT PUBLISH packet id.');
    }
    packetId = ((packet.body[payloadOffset] ?? 0) << 8) | (packet.body[payloadOffset + 1] ?? 0);
    payloadOffset += 2;
  }

  return {
    topic,
    payload: packet.body.slice(payloadOffset),
    qos,
    ...(packetId === undefined ? {} : { packetId }),
  };
}
