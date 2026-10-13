/**
 * Audit only canonical AccessPort-to-AccessPort PowerPaths here. Existing
 * incomplete/legacy records must be reviewed separately, not interpreted as
 * three missing ports connected to the same "undefined" target.
 */
function isPortId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function feed(value) {
  return value === 'A' || value === 'B' ? value : null;
}

export function auditActivePowerPaths(paths, activePortById, issue) {
  const activeTargetKeys = new Set();
  let canonicalPowerPaths = 0;
  let incompletePowerPaths = 0;

  for (const path of paths) {
    if (!isPortId(path.sourceAccessPortId) || !isPortId(path.targetAccessPortId)) {
      incompletePowerPaths += 1;
      const missing = [
        !isPortId(path.sourceAccessPortId) ? 'sourceAccessPortId' : null,
        !isPortId(path.targetAccessPortId) ? 'targetAccessPortId' : null,
      ].filter(Boolean);
      const schemaKeys = Object.keys(path)
        .filter((key) => key !== '_id' && key !== 'connectionKey')
        .sort();
      issue(
        'NON_CANONICAL_POWER_PATH_ENDPOINTS',
        path.id ?? 'no-id',
        `Missing/invalid: ${missing.join(', ')}; document keys: ${schemaKeys.join(', ')}`,
      );
      continue;
    }

    canonicalPowerPaths += 1;
    const source = activePortById.get(path.sourceAccessPortId);
    const target = activePortById.get(path.targetAccessPortId);
    if (!source || source.portType !== 'POWER' || source.direction === 'INPUT') {
      issue('INVALID_POWER_SOURCE', path.id, String(path.sourceAccessPortId));
    }
    if (!target || target.portType !== 'POWER' || target.direction === 'OUTPUT') {
      issue('INVALID_POWER_TARGET', path.id, String(path.targetAccessPortId));
    }
    if (activeTargetKeys.has(path.targetAccessPortId)) {
      issue('MULTIPLE_ACTIVE_POWER_PATHS_FOR_INPUT', path.id, path.targetAccessPortId);
    }
    activeTargetKeys.add(path.targetAccessPortId);

    const sourceFeed = feed(source?.attributes?.feed);
    const targetFeed = feed(target?.attributes?.feed);
    const pathFeed = feed(path.feed);
    if (
      (sourceFeed && targetFeed && sourceFeed !== targetFeed) ||
      (pathFeed &&
        ((sourceFeed && pathFeed !== sourceFeed) || (targetFeed && pathFeed !== targetFeed)))
    ) {
      issue('POWER_FEED_MISMATCH', path.id);
    }
  }

  return { canonicalPowerPaths, incompletePowerPaths };
}
