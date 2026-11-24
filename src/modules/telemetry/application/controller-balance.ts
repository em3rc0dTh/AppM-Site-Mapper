import type { SnmpControllerProfile } from '../domain/snmp-controller-profile';
import type { Signal } from '../domain/industrial/observations';

export function projectControllerBalance(
  profile: SnmpControllerProfile,
  signals: readonly Signal[],
  now = Date.now(),
) {
  const config = profile.balance;
  if (!config) return null;

  const find = (oid: string) => {
    const matches = signals.filter(
      (s) => s.protocol === 'SNMP' && s.sourceIdentity === profile.sourceIdentity && s.key === oid,
    );

    if (matches.length !== 1) return null;

    const s = matches[0]!;
    const age = now - Date.parse(s.observedAt);
    const receivedAge = now - Date.parse(s.receivedAt);

    if (
      !Number.isFinite(age) ||
      !Number.isFinite(receivedAge) ||
      !Number.isFinite(s.staleMs) ||
      age < -10000 ||
      receivedAge < -10000 ||
      age > s.staleMs ||
      receivedAge > s.staleMs ||
      !['VALID', 'UNKNOWN'].includes(s.quality) ||
      typeof s.rawValue !== 'number' ||
      !Number.isFinite(s.rawValue)
    )
      return null;

    return s;
  };

  const total = find(config.totalOid);
  const branch = find(config.branchOid);
  const voltage = find(config.voltageOid);
  const status = find(config.branchStatusOid);

  const coherent = Boolean(
    total &&
    branch &&
    status &&
    total.eventId === branch.eventId &&
    branch.eventId === status.eventId,
  );

  const totalRaw = total && typeof total.rawValue === 'number' ? total.rawValue : null;

  const branchRaw = branch && typeof branch.rawValue === 'number' ? branch.rawValue : null;

  const voltageRaw = voltage && typeof voltage.rawValue === 'number' ? voltage.rawValue : null;

  const difference =
    coherent && totalRaw !== null && branchRaw !== null ? totalRaw - branchRaw : null;

  const n = config.normalization;

  const scale = (raw: number | null, factor: number | undefined): number | null => {
    if (raw === null || factor === undefined) return null;
    const value = raw * factor;
    return Number.isFinite(value) ? value : null;
  };

  const totalA = scale(totalRaw, n?.totalCurrentScale);
  const branchA = scale(branchRaw, n?.branchCurrentScale);
  const voltageV = scale(voltageRaw, n?.voltageScale);

  const remainderA =
    coherent && totalA !== null && branchA !== null ? scale(totalA - branchA, 1) : null;

  const estimatedPowerKw =
    totalA !== null && voltageV !== null && total?.eventId === voltage?.eventId
      ? scale(totalA * Math.abs(voltageV), 0.001)
      : null;

  return {
    method: config.method,
    normalized: {
      totalA,
      branchA,
      remainderA,
      voltageV,
      estimatedPowerKw,
    },
    authority: 'DIAGNOSTIC_ONLY' as const,
    sourceIdentity: profile.sourceIdentity,
    totalRaw,
    voltageRaw,
    branchRaw,
    remainderRaw: difference !== null && Number.isFinite(difference) ? difference : null,
    branchStatus: status?.enumLabel ?? null,
    observedAt: total?.observedAt ?? null,
    coherent,
  };
}
