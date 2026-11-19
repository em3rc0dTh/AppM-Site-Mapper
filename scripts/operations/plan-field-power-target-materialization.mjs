#!/usr/bin/env node
/**
 * FIELD powered-target materialization PLAN for QDF-2 / QDF-4 / QDF-5.
 *
 * Contract:
 * - PLAN-only. This script never writes to MongoDB.
 * - Groups declared breaker targets into canonical Equipment/PDU identities.
 * - Detects existing target Equipment and declared POWER INPUT AID endpoints.
 * - Reports the exact materialization gap without inventing parent Device, Rack U,
 *   Equipment, AccessPort or PowerPath records.
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

const fail = (reason) => {
  console.error('FIELD_POWER_TARGET_MATERIALIZATION_ERROR: ' + reason);
  process.exit(2);
};

if (args.includes('--apply')) {
  fail('PLAN_ONLY_NO_APPLY: this tool never materializes inventory');
}
if (!mongoUri) fail('MONGODB_URI must be set privately in the runtime environment');
if (!qdfs.length) fail('--qdfs must contain at least one QDF');
if (!Number.isInteger(expectedBreakers) || expectedBreakers < 1) {
  fail('invalid --expected-breakers');
}
if (!Number.isInteger(expectedTargets) || expectedTargets < 1) {
  fail('invalid --expected-targets');
}

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const stringValue = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const feedOf = (value) => (value === 'A' || value === 'B' ? value : null);
const uniqueNormalized = (values) => [
  ...new Set(values.map((value) => normalize(value)).filter(Boolean)),
];

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

const activePowerInputs = (equipment) =>
  (Array.isArray(equipment?.accessPorts) ? equipment.accessPorts : []).filter(
    (port) =>
      port?.lifecycle === 'ACTIVE' &&
      port?.portType === 'POWER' &&
      port?.exposure === 'EXTERNAL' &&
      port?.direction === 'INPUT',
  );

const portIdentityTokens = (port) => {
  const attributes =
    port?.attributes && typeof port.attributes === 'object' && !Array.isArray(port.attributes)
      ? port.attributes
      : {};
  return uniqueNormalized([
    port?.name,
    attributes.aid,
    attributes.localAid,
    attributes.endpointAid,
    attributes.targetAid,
    attributes.targetLocalAid,
  ]);
};

const portFeed = (port) => {
  const value = port?.attributes?.feed;
  return value === 'A' || value === 'B' ? value : null;
};

const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri, {
  appName: 'sitemapper-field-powered-target-materialization-plan',
});

try {
  await client.connect();
  const db = client.db(databaseName);
  const topology = db.collection('topology_nodes');

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
        '; refuse to plan against incomplete/changed inventory',
    );
  }

  const contextMatchesIdentity = (candidate, contextHints) => {
    const needles = uniqueNormalized(contextHints);
    if (!needles.length) return false;
    let current = candidate;
    const visited = new Set();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const strings = [
        normalize(current.name),
        ...(Array.isArray(current.aliases) ? current.aliases.map(normalize) : []),
        normalize(current.category),
        ...shallowStrings(current.attributes),
      ].filter(Boolean);

      if (
        needles.some((needle) =>
          strings.some((value) => value === needle || value.includes(needle)),
        )
      ) {
        return true;
      }
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return false;
  };

  const groups = new Map();
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
    const feed = feedOf(declaration.feed);
    const targetLabel = stringValue(declaration.targetLabel);
    const targetEntityName = stringValue(declaration.targetEntityName);
    const targetCanonicalEntityName = stringValue(declaration.targetCanonicalEntityName);
    const targetKind =
      declaration.targetKind === 'EQUIPMENT' || declaration.targetKind === 'PDU'
        ? declaration.targetKind
        : null;
    const targetAid = stringValue(declaration.targetAid);
    const targetLocalAid = stringValue(declaration.targetLocalAid);
    const targetBaseAid = stringValue(declaration.targetBaseAid);
    const targetRackAid = stringValue(declaration.targetRackAid);
    const targetFootprint = stringValue(declaration.targetFootprint);
    const targetMaterialization = stringValue(declaration.targetMaterialization);

    const canonicalName = targetCanonicalEntityName || targetEntityName;
    if (!qdf || !feed || !canonicalName || !targetKind || !targetAid || !targetRackAid) {
      declarationErrors.push({
        breakerId: breaker.id,
        breaker: breaker.name,
        qdf,
        reason: 'DECLARATION_IDENTITY_INCOMPLETE',
        feed,
        targetLabel,
        targetEntityName,
        targetCanonicalEntityName,
        targetKind,
        targetAid,
        targetLocalAid,
        targetRackAid,
      });
      continue;
    }

    const key =
      targetKind === 'PDU'
        ? `PDU|${targetBaseAid || targetRackAid + '|' + canonicalName}`
        : `EQUIPMENT|${targetRackAid}|${canonicalName}`;

    const group = groups.get(key) ?? {
      key,
      kind: targetKind,
      canonicalName,
      entityNames: new Set(),
      qdfs: new Set(),
      rackAids: new Set(),
      footprints: new Set(),
      materializationStates: new Set(),
      endpoints: new Map(),
    };

    if (targetEntityName) group.entityNames.add(targetEntityName);
    group.entityNames.add(canonicalName);
    group.qdfs.add(qdf);
    group.rackAids.add(targetRackAid);
    if (targetFootprint) group.footprints.add(targetFootprint);
    if (targetMaterialization) group.materializationStates.add(targetMaterialization);

    const endpoint = group.endpoints.get(targetAid) ?? {
      aid: targetAid,
      localAids: new Set(),
      feeds: new Set(),
      breakerRefs: [],
      labels: new Set(),
    };
    if (targetLocalAid) endpoint.localAids.add(targetLocalAid);
    endpoint.feeds.add(feed);
    endpoint.breakerRefs.push({
      breakerId: breaker.id,
      breaker: breaker.name,
      qdf,
      feed,
    });
    if (targetLabel) endpoint.labels.add(targetLabel);
    group.endpoints.set(targetAid, endpoint);
    groups.set(key, group);
  }

  if (declarationErrors.length) {
    console.log(
      JSON.stringify(
        {
          mode: 'PLAN_READ_ONLY',
          database: databaseName,
          qdfs,
          scannedBreakers: breakers.length,
          declarationErrors,
          invariant: 'NO_INVENTORY_OR_POWERPATH_MUTATION',
        },
        null,
        2,
      ),
    );
    process.exitCode = 3;
  } else {
    if (groups.size !== expectedTargets) {
      fail(
        'expected ' +
          expectedTargets +
          ' canonical powered targets, grouped ' +
          groups.size +
          '; refuse to plan against changed identity cardinality',
      );
    }

    const targets = [];

    for (const group of groups.values()) {
      const entityHints = uniqueNormalized([...group.entityNames]);
      const contextHints = [...group.rackAids, ...group.footprints];

      let targetCandidates = candidates.filter((candidate) =>
        entityHints.some((hint) => identityTokens(candidate).includes(hint)),
      );

      if (targetCandidates.length > 1 && contextHints.length) {
        const narrowed = targetCandidates.filter((candidate) =>
          contextMatchesIdentity(candidate, contextHints),
        );
        if (narrowed.length) targetCandidates = narrowed;
      }

      let entityStatus = 'ENTITY_NOT_MATERIALIZED';
      let existingEntity = null;
      if (targetCandidates.length === 1) {
        entityStatus = 'ENTITY_MATCH';
        existingEntity = targetCandidates[0];
      } else if (targetCandidates.length > 1) {
        entityStatus = 'ENTITY_AMBIGUOUS';
      }

      const endpointResults = [];
      for (const endpoint of group.endpoints.values()) {
        const localAids = [...endpoint.localAids];
        const endpointHints = uniqueNormalized([endpoint.aid, ...localAids]);
        let status = 'BLOCKED_BY_ENTITY';
        let matchedPortId = null;
        let candidatePortIds = [];

        if (existingEntity) {
          const inputs = activePowerInputs(existingEntity);
          const matches = inputs.filter((port) =>
            endpointHints.some((hint) => portIdentityTokens(port).includes(hint)),
          );
          candidatePortIds = matches.map((port) => port.id);

          if (matches.length === 1) {
            const declaredFeeds = [...endpoint.feeds];
            const existingFeed = portFeed(matches[0]);
            if (existingFeed && declaredFeeds.length === 1 && existingFeed !== declaredFeeds[0]) {
              status = 'ENDPOINT_FEED_CONFLICT';
            } else {
              status = 'ENDPOINT_MATCH';
              matchedPortId = matches[0].id;
            }
          } else if (matches.length > 1) {
            status = 'ENDPOINT_AMBIGUOUS';
          } else {
            status = 'ENDPOINT_NOT_MATERIALIZED';
          }
        }

        endpointResults.push({
          aid: endpoint.aid,
          localAids,
          feeds: [...endpoint.feeds].sort(),
          labels: [...endpoint.labels].sort(),
          breakerRefs: endpoint.breakerRefs,
          status,
          matchedPortId,
          candidatePortIds,
        });
      }

      const endpointStatuses = new Set(endpointResults.map((item) => item.status));
      let requiredAction = 'NONE';
      if (entityStatus === 'ENTITY_NOT_MATERIALIZED') {
        requiredAction = 'MATERIALIZE_ENTITY_AND_ENDPOINTS';
      } else if (entityStatus === 'ENTITY_AMBIGUOUS') {
        requiredAction = 'REVIEW_ENTITY_AMBIGUITY';
      } else if (
        endpointStatuses.has('ENDPOINT_AMBIGUOUS') ||
        endpointStatuses.has('ENDPOINT_FEED_CONFLICT')
      ) {
        requiredAction = 'REVIEW_ENDPOINT_CONFLICT';
      } else if (endpointStatuses.has('ENDPOINT_NOT_MATERIALIZED')) {
        requiredAction = 'MATERIALIZE_ENDPOINTS';
      }

      targets.push({
        key: group.key,
        kind: group.kind,
        canonicalName: group.canonicalName,
        entityNames: [...group.entityNames].sort(),
        qdfs: [...group.qdfs].sort(),
        rackAids: [...group.rackAids].sort(),
        footprints: [...group.footprints].sort(),
        declaredMaterializationStates: [...group.materializationStates].sort(),
        entityStatus,
        existingEntityId: existingEntity?.id ?? null,
        existingEntityName: existingEntity?.name ?? null,
        candidateEntityIds: targetCandidates.map((candidate) => candidate.id),
        endpointCount: endpointResults.length,
        endpoints: endpointResults,
        requiredAction,
        placementBoundary: 'RACK_ASSOCIATED_U_UNKNOWN',
        parentAuthorization: 'NOT_DECLARED_DO_NOT_INFER',
      });
    }

    targets.sort(
      (left, right) =>
        left.qdfs.join(',').localeCompare(right.qdfs.join(',')) ||
        left.rackAids.join(',').localeCompare(right.rackAids.join(',')) ||
        left.canonicalName.localeCompare(right.canonicalName),
    );

    const endpointResults = targets.flatMap((target) => target.endpoints);
    const summary = {
      mode: 'PLAN_READ_ONLY',
      database: databaseName,
      qdfs,
      scannedBreakers: breakers.length,
      canonicalTargets: targets.length,
      entityMatches: targets.filter((item) => item.entityStatus === 'ENTITY_MATCH').length,
      entityNotMaterialized: targets.filter(
        (item) => item.entityStatus === 'ENTITY_NOT_MATERIALIZED',
      ).length,
      entityAmbiguous: targets.filter((item) => item.entityStatus === 'ENTITY_AMBIGUOUS').length,
      declaredEndpoints: endpointResults.length,
      endpointMatches: endpointResults.filter((item) => item.status === 'ENDPOINT_MATCH').length,
      endpointNotMaterialized: endpointResults.filter(
        (item) => item.status === 'ENDPOINT_NOT_MATERIALIZED',
      ).length,
      endpointBlockedByEntity: endpointResults.filter((item) => item.status === 'BLOCKED_BY_ENTITY')
        .length,
      endpointConflicts: endpointResults.filter((item) =>
        ['ENDPOINT_AMBIGUOUS', 'ENDPOINT_FEED_CONFLICT'].includes(item.status),
      ).length,
      requiredActions: targets.reduce((counts, item) => {
        counts[item.requiredAction] = (counts[item.requiredAction] ?? 0) + 1;
        return counts;
      }, {}),
      invariant: 'NO_INVENTORY_OR_POWERPATH_MUTATION',
      targets,
    };

    console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  await client.close();
}
