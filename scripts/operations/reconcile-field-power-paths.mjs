#!/usr/bin/env node
/**
 * FIELD PowerPath reconciliation for QDF-2 / QDF-4 / QDF-5.
 *
 * Contract:
 * - PLAN is read-only by default.
 * - Never creates/renames/moves/deletes Device, Equipment, Panel, Breaker or AccessPort.
 * - Only proposes/creates PowerPath when breaker, target Equipment and both POWER ports
 *   already exist and resolve unambiguously.
 * - Existing exact paths are MATCH.
 * - Conflicting/ambiguous/missing topology is reported and never mutated.
 * - APPLY is idempotent and requires an explicit acknowledgement + private backup.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const apply = args.includes('--apply');
const ack = option('--ack');
const backupPath = option('--backup');
const mongoUri = process.env.MONGODB_URI;
const databaseName = option(
  '--database',
  process.env.MONGODB_DB_NAME ?? process.env.SITEMAPPER_DATABASE ?? 'seed-01',
);
const qdfs = String(option('--qdfs', 'QDF-2,QDF-4,QDF-5'))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const expectedBreakers = Number(option('--expected-breakers', '74'));

const fail = (reason) => {
  console.error('FIELD_POWERPATH_ERROR: ' + reason);
  process.exit(2);
};

if (!mongoUri) fail('MONGODB_URI must be set privately in the runtime environment');
if (!qdfs.length) fail('--qdfs must contain at least one QDF');
if (!Number.isInteger(expectedBreakers) || expectedBreakers < 1)
  fail('invalid --expected-breakers');
if (apply && (ack !== 'RECONCILE_FIELD_POWER_PATHS' || !backupPath)) {
  fail(
    '--apply requires --ack RECONCILE_FIELD_POWER_PATHS and --backup .runtime/<private-file>.json',
  );
}
if (apply && !path.resolve(backupPath).includes(path.sep + '.runtime' + path.sep)) {
  fail('backup must be stored under a private .runtime/ directory');
}

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const feedOf = (value) => (value === 'A' || value === 'B' ? value : null);
const feedFromPortName = (name) => {
  const value = normalize(name);
  if (/^(?:POWER\s+)?(?:INPUT\s+|IN\s+|FEED\s+)?A$/.test(value)) return 'A';
  if (/^(?:POWER\s+)?(?:INPUT\s+|IN\s+|FEED\s+)?B$/.test(value)) return 'B';
  return null;
};
const activePowerPorts = (equipment, direction) =>
  (Array.isArray(equipment?.accessPorts) ? equipment.accessPorts : []).filter(
    (port) =>
      port?.lifecycle === 'ACTIVE' &&
      port?.portType === 'POWER' &&
      port?.exposure === 'EXTERNAL' &&
      port?.direction === direction,
  );

const stablePathId = (sourcePortId, targetPortId) =>
  'reconcile:powerpath:' +
  createHash('sha256')
    .update(sourcePortId + '|' + targetPortId)
    .digest('hex');

const shallowStrings = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const result = [];
  for (const child of Object.values(value)) {
    if (typeof child === 'string' || typeof child === 'number') result.push(normalize(child));
    if (Array.isArray(child)) {
      for (const item of child) {
        if (typeof item === 'string' || typeof item === 'number') result.push(normalize(item));
      }
    }
  }
  return result;
};

const identityTokens = (equipment) =>
  [equipment.name, ...(Array.isArray(equipment.aliases) ? equipment.aliases : [])]
    .map(normalize)
    .filter(Boolean);

const portFeed = (port) => feedOf(port?.attributes?.feed) ?? feedFromPortName(port?.name);

const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri, {
  appName: 'sitemapper-field-powerpath-controlled-reconciliation',
});

const findings = [];
const creates = [];
const report = (status, breaker, details = {}) => {
  findings.push({
    status,
    qdf: breaker?.attributes?.declaredPower?.qdf ?? '?',
    breakerId: breaker?.id ?? '?',
    breaker: breaker?.name ?? '?',
    ...details,
  });
};

try {
  await client.connect();
  const db = client.db(databaseName);
  const topology = db.collection('topology_nodes');
  const powerPaths = db.collection('power_paths');

  const nodes = await topology.find({ lifecycle: 'ACTIVE' }).toArray();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const equipment = nodes.filter((node) => node.kind === 'EQUIPMENT');
  const candidates = equipment.filter((node) => node.equipmentType !== 'CIRCUIT_BREAKER');
  const breakers = equipment.filter(
    (node) =>
      node.equipmentType === 'CIRCUIT_BREAKER' &&
      qdfs.includes(node.attributes?.declaredPower?.qdf),
  );

  if (breakers.length !== expectedBreakers) {
    fail(
      'expected ' +
        expectedBreakers +
        ' declared QDF breakers, found ' +
        breakers.length +
        '; refuse to infer against incomplete/changed inventory',
    );
  }

  const activePaths = await powerPaths.find({ lifecycle: 'ACTIVE' }).toArray();
  const sourceOwners = new Map();
  const targetOwners = new Map();
  for (const powerPath of activePaths) {
    if (powerPath.sourceAccessPortId) {
      const list = sourceOwners.get(powerPath.sourceAccessPortId) ?? [];
      list.push(powerPath);
      sourceOwners.set(powerPath.sourceAccessPortId, list);
    }
    if (powerPath.targetAccessPortId) {
      const list = targetOwners.get(powerPath.targetAccessPortId) ?? [];
      list.push(powerPath);
      targetOwners.set(powerPath.targetAccessPortId, list);
    }
  }

  const contextMatchesFootprint = (candidate, footprint) => {
    const needle = normalize(footprint);
    if (!needle) return false;
    let current = candidate;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const strings = [
        normalize(current.name),
        ...(Array.isArray(current.aliases) ? current.aliases.map(normalize) : []),
        normalize(current.category),
        ...shallowStrings(current.attributes),
      ];
      if (strings.some((value) => value === needle || value.includes(needle))) return true;
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return false;
  };

  for (const breaker of breakers) {
    const declaration = breaker.attributes?.declaredPower;
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      report('UNRESOLVED', breaker, { reason: 'DECLARATION_MISSING' });
      continue;
    }
    const feed = feedOf(declaration.feed);
    const targetLabel = String(declaration.targetLabel ?? '').trim();
    const footprint = String(declaration.targetFootprint ?? '').trim();
    if (!feed || !targetLabel) {
      report('UNRESOLVED', breaker, { reason: 'DECLARATION_INCOMPLETE', feed, targetLabel });
      continue;
    }

    const sourcePorts = activePowerPorts(breaker, 'OUTPUT');
    if (sourcePorts.length !== 1) {
      report(sourcePorts.length ? 'CONFLICT' : 'UNRESOLVED', breaker, {
        reason: sourcePorts.length ? 'SOURCE_PORT_AMBIGUOUS' : 'SOURCE_PORT_MISSING',
        count: sourcePorts.length,
        feed,
        targetLabel,
        footprint,
      });
      continue;
    }
    const sourcePort = sourcePorts[0];

    const labelKey = normalize(targetLabel);
    let targetCandidates = candidates.filter(
      (candidate) =>
        candidate.deviceId !== breaker.deviceId && identityTokens(candidate).includes(labelKey),
    );

    if (targetCandidates.length > 1 && footprint) {
      const narrowed = targetCandidates.filter((candidate) =>
        contextMatchesFootprint(candidate, footprint),
      );
      if (narrowed.length) targetCandidates = narrowed;
    }

    if (targetCandidates.length !== 1) {
      report(targetCandidates.length ? 'CONFLICT' : 'UNRESOLVED', breaker, {
        reason: targetCandidates.length ? 'TARGET_AMBIGUOUS' : 'TARGET_NOT_FOUND',
        targetLabel,
        footprint,
        feed,
        candidateIds: targetCandidates.map((candidate) => candidate.id),
      });
      continue;
    }

    const target = targetCandidates[0];
    const allInputs = activePowerPorts(target, 'INPUT');
    const explicitFeedInputs = allInputs.filter((port) => portFeed(port) === feed);
    let targetPorts = explicitFeedInputs;
    let targetPortResolution = 'EXPLICIT_FEED';

    if (!targetPorts.length && allInputs.length === 1) {
      targetPorts = allInputs;
      targetPortResolution = 'SOLE_INPUT_ON_EXACT_TARGET';
    }

    if (targetPorts.length !== 1) {
      report(targetPorts.length ? 'CONFLICT' : 'UNRESOLVED', breaker, {
        reason: targetPorts.length ? 'TARGET_PORT_AMBIGUOUS' : 'TARGET_PORT_MISSING',
        targetId: target.id,
        targetName: target.name,
        targetLabel,
        footprint,
        feed,
        inputPortIds: allInputs.map((port) => port.id),
      });
      continue;
    }

    const targetPort = targetPorts[0];
    const targetPortDeclaredFeed = portFeed(targetPort);
    if (targetPortDeclaredFeed && targetPortDeclaredFeed !== feed) {
      report('CONFLICT', breaker, {
        reason: 'TARGET_PORT_FEED_MISMATCH',
        targetId: target.id,
        targetName: target.name,
        feed,
        targetPortId: targetPort.id,
        targetPortFeed: targetPortDeclaredFeed,
      });
      continue;
    }

    const exact = activePaths.find(
      (powerPath) =>
        powerPath.sourceAccessPortId === sourcePort.id &&
        powerPath.targetAccessPortId === targetPort.id,
    );
    if (exact) {
      if (exact.feed && exact.feed !== feed) {
        report('CONFLICT', breaker, {
          reason: 'EXACT_PATH_FEED_MISMATCH',
          pathId: exact.id,
          feed,
          existingFeed: exact.feed,
          targetId: target.id,
          targetName: target.name,
        });
      } else {
        report('MATCH', breaker, {
          pathId: exact.id,
          feed,
          targetId: target.id,
          targetName: target.name,
          targetLabel,
          footprint,
          sourcePortId: sourcePort.id,
          targetPortId: targetPort.id,
        });
      }
      continue;
    }

    const existingFromSource = sourceOwners.get(sourcePort.id) ?? [];
    const existingToTarget = targetOwners.get(targetPort.id) ?? [];
    if (existingFromSource.length || existingToTarget.length) {
      report('CONFLICT', breaker, {
        reason: existingFromSource.length ? 'SOURCE_ALREADY_CONNECTED' : 'TARGET_ALREADY_CONNECTED',
        feed,
        targetId: target.id,
        targetName: target.name,
        existingSourcePathIds: existingFromSource.map((item) => item.id),
        existingTargetPathIds: existingToTarget.map((item) => item.id),
      });
      continue;
    }

    const proposed = {
      id: stablePathId(sourcePort.id, targetPort.id),
      sourceAccessPortId: sourcePort.id,
      targetAccessPortId: targetPort.id,
      feed,
      connectionKey: targetPort.id,
      label: declaration.qdf + ' ' + breaker.name + ' -> ' + target.name,
      lifecycle: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    creates.push({
      breakerId: breaker.id,
      breakerName: breaker.name,
      qdf: declaration.qdf,
      pairId: declaration.pairId,
      targetLabel,
      footprint,
      targetId: target.id,
      targetName: target.name,
      targetPortResolution,
      proposed,
    });
    report('CREATE', breaker, {
      feed,
      targetId: target.id,
      targetName: target.name,
      targetLabel,
      footprint,
      sourcePortId: sourcePort.id,
      targetPortId: targetPort.id,
      targetPortResolution,
      proposedPathId: proposed.id,
    });
  }

  const duplicateSources = creates
    .map((item) => item.proposed.sourceAccessPortId)
    .filter((value, index, all) => all.indexOf(value) !== index);
  const duplicateTargets = creates
    .map((item) => item.proposed.targetAccessPortId)
    .filter((value, index, all) => all.indexOf(value) !== index);
  if (duplicateSources.length || duplicateTargets.length) {
    fail('proposed CREATE set contains duplicate source/target ports; no APPLY allowed');
  }

  const summary = {
    mode: apply ? 'APPLY' : 'PLAN_READ_ONLY',
    database: databaseName,
    qdfs,
    scannedBreakers: breakers.length,
    matches: findings.filter((item) => item.status === 'MATCH').length,
    creates: findings.filter((item) => item.status === 'CREATE').length,
    conflicts: findings.filter((item) => item.status === 'CONFLICT').length,
    unresolved: findings.filter((item) => item.status === 'UNRESOLVED').length,
    invariant: 'NO_TOPOLOGY_OR_ACCESSPORT_MUTATION',
    findings,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (apply && creates.length) {
    await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(
      backupPath,
      JSON.stringify(
        {
          database: databaseName,
          capturedAt: new Date().toISOString(),
          qdfs,
          existingActivePowerPaths: activePaths,
          proposedCreates: creates,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const change of creates) {
          const sourceOwner = await topology.findOne(
            {
              kind: 'EQUIPMENT',
              lifecycle: 'ACTIVE',
              id: change.breakerId,
              accessPorts: {
                $elemMatch: {
                  id: change.proposed.sourceAccessPortId,
                  lifecycle: 'ACTIVE',
                  portType: 'POWER',
                  exposure: 'EXTERNAL',
                  direction: 'OUTPUT',
                },
              },
            },
            { session },
          );
          const targetOwner = await topology.findOne(
            {
              kind: 'EQUIPMENT',
              lifecycle: 'ACTIVE',
              id: change.targetId,
              accessPorts: {
                $elemMatch: {
                  id: change.proposed.targetAccessPortId,
                  lifecycle: 'ACTIVE',
                  portType: 'POWER',
                  exposure: 'EXTERNAL',
                  direction: 'INPUT',
                },
              },
            },
            { session },
          );
          if (!sourceOwner || !targetOwner) throw Error('CONCURRENT_ENDPOINT_CHANGE');

          const collision = await powerPaths.findOne(
            {
              lifecycle: 'ACTIVE',
              $or: [
                { sourceAccessPortId: change.proposed.sourceAccessPortId },
                { targetAccessPortId: change.proposed.targetAccessPortId },
                { connectionKey: change.proposed.targetAccessPortId },
              ],
            },
            { session },
          );
          if (collision) {
            const exact =
              collision.sourceAccessPortId === change.proposed.sourceAccessPortId &&
              collision.targetAccessPortId === change.proposed.targetAccessPortId &&
              (!collision.feed || collision.feed === change.proposed.feed);
            if (!exact) throw Error('CONCURRENT_POWERPATH_CONFLICT');
            continue;
          }

          await powerPaths.insertOne(change.proposed, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    console.log(
      JSON.stringify({
        status: 'APPLIED',
        created: creates.length,
        database: databaseName,
        backupPath,
        note: 'Only PowerPath records were eligible for insertion; topology and AccessPorts were untouched.',
      }),
    );
  }
} finally {
  await client.close();
}
