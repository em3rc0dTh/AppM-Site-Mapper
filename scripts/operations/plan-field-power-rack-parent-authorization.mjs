#!/usr/bin/env node
/**
 * FIELD Rack/Parent Authorization PLAN for powered targets.
 *
 * Contract:
 * - PLAN-only. This script never writes to MongoDB.
 * - Derives the 13 declared destination RackAIDs from seed-01 v14 breaker declarations.
 * - Resolves existing canonical Rack nodes and target-named Device evidence.
 * - Never invents Rack, Device, Equipment, Rack U, AccessPort or PowerPath records.
 * - Existing topology evidence is reported; ownership is never inferred from proximity alone.
 */
import process from 'node:process';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const mongoUri = process.env.MONGODB_URI;
const databaseName = option(
  '--database',
  process.env.MONGODB_DB_NAME ?? process.env.SITEMAPPER_DATABASE ?? 'seed-01',
);
const qdfs = String(option('--qdfs', 'QDF-2,QDF-4,QDF-5'))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const expectedBreakers = Number(option('--expected-breakers', '76'));
const expectedTargets = Number(option('--expected-targets', '19'));
const expectedRacks = Number(option('--expected-racks', '13'));

const fail = (reason) => {
  console.error('FIELD_POWER_RACK_PARENT_PLAN_ERROR: ' + reason);
  process.exit(2);
};

if (args.includes('--apply')) {
  fail('PLAN_ONLY_NO_APPLY: this tool never materializes or reparents topology');
}
if (!mongoUri) fail('MONGODB_URI must be set privately in the runtime environment');
if (!qdfs.length) fail('--qdfs must contain at least one QDF');
if (!Number.isInteger(expectedBreakers) || expectedBreakers < 1) {
  fail('invalid --expected-breakers');
}
if (!Number.isInteger(expectedTargets) || expectedTargets < 1) {
  fail('invalid --expected-targets');
}
if (!Number.isInteger(expectedRacks) || expectedRacks < 1) {
  fail('invalid --expected-racks');
}

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const stringValue = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');

const shallowStrings = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const result = [];
  for (const child of Object.values(value)) {
    if (typeof child === 'string' || typeof child === 'number') {
      result.push(normalize(child));
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        if (typeof item === 'string' || typeof item === 'number') {
          result.push(normalize(item));
        }
      }
    }
  }
  return result;
};

const rackTokens = (rack) =>
  [normalize(rack.id), normalize(rack.name), ...shallowStrings(rack.attributes)].filter(Boolean);

const deviceIdentityTokens = (device) =>
  [
    normalize(device.name),
    normalize(device.serialNumber),
    normalize(device.category),
    ...shallowStrings(device.attributes),
  ].filter(Boolean);

const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri, {
  appName: 'sitemapper-field-power-rack-parent-authorization-plan',
});

try {
  await client.connect();
  const db = client.db(databaseName);
  const topology = db.collection('topology_nodes');
  const nodes = await topology.find({ lifecycle: 'ACTIVE' }).toArray();

  const equipment = nodes.filter((node) => node.kind === 'EQUIPMENT');
  const breakers = equipment.filter(
    (node) =>
      node.equipmentType === 'CIRCUIT_BREAKER' &&
      qdfs.includes(node.attributes?.declaredPower?.qdf),
  );
  const racks = nodes.filter((node) => node.kind === 'CONTAINER_RACK' && node.variant === 'RACK');
  const devices = nodes.filter((node) => node.kind === 'DEVICE');

  if (breakers.length !== expectedBreakers) {
    fail(
      'expected ' +
        expectedBreakers +
        ' declared QDF breakers, found ' +
        breakers.length +
        '; refuse to plan against incomplete/changed inventory',
    );
  }

  const rackGroups = new Map();
  const targetKeys = new Set();
  const declarationErrors = [];

  for (const breaker of breakers) {
    const declaration = breaker.attributes?.declaredPower;
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      declarationErrors.push({
        breakerId: breaker.id,
        breaker: breaker.name,
        reason: 'DECLARATION_MISSING',
      });
      continue;
    }

    const qdf = stringValue(declaration.qdf);
    const rackAid = stringValue(declaration.targetRackAid);
    const footprint = stringValue(declaration.targetFootprint);
    const targetEntityName = stringValue(declaration.targetEntityName);
    const targetCanonicalEntityName = stringValue(declaration.targetCanonicalEntityName);
    const entityName = targetCanonicalEntityName || targetEntityName;
    const targetKind =
      declaration.targetKind === 'EQUIPMENT' || declaration.targetKind === 'PDU'
        ? declaration.targetKind
        : null;
    const targetBaseAid = stringValue(declaration.targetBaseAid);

    if (!qdf || !rackAid || !footprint || !entityName || !targetKind) {
      declarationErrors.push({
        breakerId: breaker.id,
        breaker: breaker.name,
        qdf,
        reason: 'DECLARATION_RACK_PARENT_IDENTITY_INCOMPLETE',
        rackAid,
        footprint,
        entityName,
        targetEntityName,
        targetCanonicalEntityName,
        targetKind,
      });
      continue;
    }

    const targetKey =
      targetKind === 'PDU'
        ? `PDU|${targetBaseAid || rackAid + '|' + entityName}`
        : `EQUIPMENT|${rackAid}|${entityName}`;
    targetKeys.add(targetKey);

    const group = rackGroups.get(rackAid) ?? {
      rackAid,
      footprints: new Set(),
      qdfs: new Set(),
      targets: new Map(),
    };
    group.footprints.add(footprint);
    group.qdfs.add(qdf);

    const target = group.targets.get(targetKey) ?? {
      key: targetKey,
      canonicalName: entityName,
      kind: targetKind,
      identityNames: new Set(),
      breakerIds: new Set(),
      qdfs: new Set(),
    };
    if (targetEntityName) target.identityNames.add(targetEntityName);
    if (targetCanonicalEntityName) target.identityNames.add(targetCanonicalEntityName);
    target.identityNames.add(entityName);
    target.breakerIds.add(breaker.id);
    target.qdfs.add(qdf);
    group.targets.set(targetKey, target);
    rackGroups.set(rackAid, group);
  }

  if (declarationErrors.length) {
    console.log(
      JSON.stringify(
        {
          mode: 'PLAN_READ_ONLY',
          database: databaseName,
          scannedBreakers: breakers.length,
          declarationErrors,
          invariant: 'NO_TOPOLOGY_OR_POWERPATH_MUTATION',
        },
        null,
        2,
      ),
    );
    process.exitCode = 3;
  } else {
    if (targetKeys.size !== expectedTargets) {
      fail(
        'expected ' +
          expectedTargets +
          ' canonical targets, grouped ' +
          targetKeys.size +
          '; refuse to plan against changed target cardinality',
      );
    }
    if (rackGroups.size !== expectedRacks) {
      fail(
        'expected ' +
          expectedRacks +
          ' destination RackAIDs, grouped ' +
          rackGroups.size +
          '; refuse to plan against changed rack cardinality',
      );
    }

    const rackResults = [];

    for (const group of rackGroups.values()) {
      const footprintValues = [...group.footprints];
      const rackAidKey = normalize(group.rackAid);
      const footprintKeys = footprintValues.map(normalize);

      let candidates = racks.filter((rack) => rackTokens(rack).includes(rackAidKey));
      let resolutionBasis = candidates.length ? 'EXACT_RACK_AID' : 'NONE';

      if (!candidates.length) {
        candidates = racks.filter((rack) => {
          const tokens = rackTokens(rack);
          return footprintKeys.some((footprint) =>
            tokens.some((token) => token === footprint || token.includes(footprint)),
          );
        });
        if (candidates.length) resolutionBasis = 'FOOTPRINT_CONTEXT';
      }

      let rackStatus = 'RACK_NOT_MATERIALIZED';
      let resolvedRack = null;
      if (candidates.length === 1) {
        rackStatus = 'RACK_MATCH';
        resolvedRack = candidates[0];
      } else if (candidates.length > 1) {
        rackStatus = 'RACK_AMBIGUOUS';
      }

      const directDevices = resolvedRack
        ? devices.filter((device) => device.parentId === resolvedRack.id)
        : [];

      const targetResults = [...group.targets.values()]
        .map((target) => {
          let targetDeviceStatus = 'BLOCKED_BY_RACK';
          let targetDeviceCandidates = [];

          if (resolvedRack) {
            const identityKeys = [...target.identityNames].map(normalize).filter(Boolean);
            targetDeviceCandidates = directDevices.filter((device) =>
              identityKeys.some((identity) => deviceIdentityTokens(device).includes(identity)),
            );

            if (targetDeviceCandidates.length === 1) {
              targetDeviceStatus = 'TARGET_DEVICE_MATCH';
            } else if (targetDeviceCandidates.length > 1) {
              targetDeviceStatus = 'TARGET_DEVICE_AMBIGUOUS';
            } else {
              targetDeviceStatus = 'TARGET_DEVICE_NOT_MATERIALIZED';
            }
          }

          return {
            key: target.key,
            canonicalName: target.canonicalName,
            identityNames: [...target.identityNames].sort(),
            kind: target.kind,
            qdfs: [...target.qdfs].sort(),
            breakerCount: target.breakerIds.size,
            targetDeviceStatus,
            targetDeviceCandidateIds: targetDeviceCandidates.map((device) => device.id),
            targetDeviceCandidateNames: targetDeviceCandidates.map((device) => device.name),
            ownerAuthorization:
              targetDeviceStatus === 'TARGET_DEVICE_MATCH'
                ? 'EXISTING_EXACT_TARGET_DEVICE_EVIDENCE'
                : 'NOT_DECLARED_DO_NOT_INFER',
          };
        })
        .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));

      let requiredAction = 'AUTHORIZE_TARGET_DEVICE_OWNERSHIP';
      if (rackStatus === 'RACK_NOT_MATERIALIZED') {
        requiredAction = 'MATERIALIZE_OR_MAP_RACK';
      } else if (rackStatus === 'RACK_AMBIGUOUS') {
        requiredAction = 'REVIEW_RACK_AMBIGUITY';
      } else if (
        targetResults.some((target) => target.targetDeviceStatus === 'TARGET_DEVICE_AMBIGUOUS')
      ) {
        requiredAction = 'REVIEW_TARGET_DEVICE_AMBIGUITY';
      }

      rackResults.push({
        rackAid: group.rackAid,
        footprints: footprintValues.sort(),
        qdfs: [...group.qdfs].sort(),
        rackStatus,
        resolutionBasis,
        candidateRackIds: candidates.map((rack) => rack.id),
        candidateRackNames: candidates.map((rack) => rack.name),
        resolvedRackId: resolvedRack?.id ?? null,
        resolvedRackName: resolvedRack?.name ?? null,
        directDevices: directDevices.map((device) => ({
          id: device.id,
          name: device.name,
          deviceType: device.deviceType,
          category: device.category ?? null,
        })),
        targets: targetResults,
        requiredAction,
        rackPlacementAuthorization: 'RACK_IDENTITY_ONLY_U_UNKNOWN',
      });
    }

    rackResults.sort((left, right) => left.rackAid.localeCompare(right.rackAid));

    const targetResults = rackResults.flatMap((rack) => rack.targets);
    const summary = {
      mode: 'PLAN_READ_ONLY',
      database: databaseName,
      qdfs,
      scannedBreakers: breakers.length,
      canonicalTargets: targetResults.length,
      declaredRacks: rackResults.length,
      rackMatches: rackResults.filter((rack) => rack.rackStatus === 'RACK_MATCH').length,
      rackNotMaterialized: rackResults.filter((rack) => rack.rackStatus === 'RACK_NOT_MATERIALIZED')
        .length,
      rackAmbiguous: rackResults.filter((rack) => rack.rackStatus === 'RACK_AMBIGUOUS').length,
      targetDeviceMatches: targetResults.filter(
        (target) => target.targetDeviceStatus === 'TARGET_DEVICE_MATCH',
      ).length,
      targetDeviceNotMaterialized: targetResults.filter(
        (target) => target.targetDeviceStatus === 'TARGET_DEVICE_NOT_MATERIALIZED',
      ).length,
      targetDeviceAmbiguous: targetResults.filter(
        (target) => target.targetDeviceStatus === 'TARGET_DEVICE_AMBIGUOUS',
      ).length,
      targetsBlockedByRack: targetResults.filter(
        (target) => target.targetDeviceStatus === 'BLOCKED_BY_RACK',
      ).length,
      requiredActions: rackResults.reduce((counts, rack) => {
        counts[rack.requiredAction] = (counts[rack.requiredAction] ?? 0) + 1;
        return counts;
      }, {}),
      invariant: 'NO_TOPOLOGY_OR_POWERPATH_MUTATION',
      racks: rackResults,
    };

    console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  await client.close();
}
