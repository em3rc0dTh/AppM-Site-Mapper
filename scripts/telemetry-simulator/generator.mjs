const DEFAULT_GROUPS = [
  [21, 22, 23, 24],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
];

function mulberry32(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function fixed(value) {
  return Math.max(0, value).toFixed(2);
}

function breakerReading(slot, cycle, random) {
  if (slot > 12) {
    return { state: 'ONLINE' };
  }

  const active = slot === 1 || slot === 4 || slot === 7 || slot === 10;
  const phase = cycle / 5 + slot / 3;
  const jitter = (random() - 0.5) * 0.08;

  if (!active) {
    return {
      state: 'ONLINE',
      U1: '0.00',
      U2: '0.00',
      I1: '0.00',
      I2: '0.00',
      P1: '0.00',
      P2: '0.00',
      EP1: '0.00',
      EP2: '0.00',
    };
  }

  const voltage = 12.2 + Math.sin(phase) * 0.12 + jitter;
  const current = 5.5 + slot * 0.42 + Math.sin(phase * 0.7) * 1.4 + jitter * 4;
  const power = voltage * current;
  const accumulatedEnergy = 1.5 + cycle * 0.015 + slot * 0.02;

  return {
    state: 'ONLINE',
    U1: fixed(voltage),
    U2: '0.00',
    I1: fixed(current),
    I2: '0.00',
    P1: fixed(power),
    P2: '0.00',
    EP1: fixed(accumulatedEnergy),
    EP2: '0.00',
  };
}

export function buildSyntheticCycle({
  serialNumber,
  cycle,
  firstMessageId,
  epochSeconds,
  seed = 251107,
}) {
  const random = mulberry32(seed + cycle);
  let messageId = firstMessageId;

  return DEFAULT_GROUPS.map((slots) => {
    const reported = {};

    for (const slot of slots) {
      reported[`0_1_${slot}`] = breakerReading(slot, cycle, random);
    }

    const frame = {
      msgid: String(messageId),
      method: 'update',
      sn: serialNumber,
      timestamp: epochSeconds,
      sendtime: epochSeconds,
      version: 1,
      reported,
    };

    messageId += 1;
    return frame;
  });
}

export function nextMessageId(frames, fallback) {
  const last = frames.at(-1);
  if (!last) return fallback;

  const parsed = Number(last.msgid);
  return Number.isSafeInteger(parsed) ? parsed + 1 : fallback;
}
