import type { AccessPort, DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';

/**
 * Manufacturer equipment template; not an assertion that a customer's installed
 * cabinet or Delta SNMP controller has been physically inspected.
 */
export const ELTEK_BDCBB_CONFIG_2 = 'ELTEK_BDCBB_CONFIG_2' as const;
export const ELTEK_BDCBB_CONFIG_4 = 'ELTEK_BDCBB_CONFIG_4' as const;
export const CONFIG_4_RATED_CURRENT_A = 800;
export const CONFIG_4_SHUNT_CURRENT_A = 1000;
export const CONFIG_4_SHUNT_MV = 60;
export const CONFIG_4_DEFAULT_OVERLOAD_A = 640;

export type BdfbHardwareProfile = typeof ELTEK_BDCBB_CONFIG_2 | typeof ELTEK_BDCBB_CONFIG_4;
export function bdfbHardwareProfile(device: DeviceNode): BdfbHardwareProfile | null {
  const selected = device.attributes?.bdfbHardwareProfile;
  return selected === ELTEK_BDCBB_CONFIG_2 || selected === ELTEK_BDCBB_CONFIG_4 ? selected : null;
}

/** A/B is the electrical side; feedPosition is inventory data, never a fixed enum. */
export function config4FeedPosition(port: AccessPort): string | null {
  const position = port.attributes?.feedPosition;
  if (typeof position !== 'string') return null;
  const normalized = position.trim();
  return normalized.length > 0 && normalized.length <= 64 ? normalized : null;
}

export interface Config4Assessment {
  readonly hardwareProfile: typeof ELTEK_BDCBB_CONFIG_4;
  readonly expectedFeedCount: 4;
  readonly inventoriedFeedCount: number;
  readonly missingFeedPositions: readonly string[];
  readonly issues: readonly string[];
  readonly inventoryComplete: boolean;
}

function isIncoming(port: AccessPort): boolean {
  return (
    port.lifecycle === 'ACTIVE' &&
    port.portType === 'POWER' &&
    port.direction === 'INPUT' &&
    port.exposure === 'EXTERNAL' &&
    port.attributes?.snmpFeedInput === true
  );
}

/**
 * This is a physical coverage validation, not telemetry and not an estimate
 * from the number of populated breakers. No parallel Equipment tree is created.
 */
export function assessConfig4Inventory(equipment: readonly EquipmentNode[]): Config4Assessment {
  const active = equipment.filter((item) => item.lifecycle === 'ACTIVE');
  const panels = new Map(active.filter((e) => e.equipmentType === 'PANEL').map((p) => [p.id, p]));
  const ports = active.flatMap((owner) => owner.accessPorts.filter(isIncoming));
  const missingFeedPositions: string[] = [];
  const issues: string[] = [];
  const seenPositions = new Set<string>();
  const seenPanels = new Map<string, string>();

  for (const port of ports) {
    const position = config4FeedPosition(port);
    const identity = position ?? port.name;
    if (!position) {
      missingFeedPositions.push(port.name);
      issues.push(`UNIDENTIFIED_INPUT_${port.id}`);
    } else if (seenPositions.has(position)) {
      issues.push(`DUPLICATE_INPUT_${position}`);
    } else {
      seenPositions.add(position);
    }

    if (port.attributes?.feed !== 'A' && port.attributes?.feed !== 'B')
      issues.push(`WRONG_SIDE_${identity}`);
    if (port.attributes?.independentInputConfirmed !== true)
      issues.push(`SHUNT_NOT_VERIFIED_${identity}`);
    if (port.attributes?.ratedCurrentA !== CONFIG_4_RATED_CURRENT_A)
      issues.push(`RATING_NOT_CONFIRMED_${identity}`);
    if (
      port.attributes?.shuntRatedCurrentA !== CONFIG_4_SHUNT_CURRENT_A ||
      port.attributes?.shuntRatedMillivolts !== CONFIG_4_SHUNT_MV
    )
      issues.push(`SHUNT_SPEC_NOT_CONFIRMED_${identity}`);

    const references = port.attributes?.servedPanelIds;
    if (
      !Array.isArray(references) ||
      references.length !== 1 ||
      typeof references[0] !== 'string' ||
      !panels.has(references[0])
    ) {
      issues.push(`PANEL_MAPPING_INCOMPLETE_${identity}`);
    } else {
      const panelId = references[0];
      if (seenPanels.has(panelId)) issues.push(`DUPLICATE_PANEL_MAPPING_${identity}`);
      seenPanels.set(panelId, identity);
    }
  }

  if (ports.length !== 4) issues.push('EXPECTED_FOUR_INPUTS');
  if (panels.size !== 4) issues.push('EXPECTED_FOUR_PANELS');

  return {
    hardwareProfile: ELTEK_BDCBB_CONFIG_4,
    expectedFeedCount: 4,
    inventoriedFeedCount: ports.length,
    missingFeedPositions,
    issues: [...new Set(issues)],
    inventoryComplete:
      ports.length === 4 && missingFeedPositions.length === 0 && issues.length === 0,
  };
}

/** Linked-panel Configuration 2: four panels, only two independent shunts. */
export interface Config2Assessment {
  readonly hardwareProfile: typeof ELTEK_BDCBB_CONFIG_2;
  readonly expectedFeedCount: 2;
  readonly inventoriedFeedCount: number;
  readonly missingFeedPositions: readonly ('A' | 'B')[];
  readonly issues: readonly string[];
  readonly inventoryComplete: boolean;
}
export function assessConfig2Inventory(equipment: readonly EquipmentNode[]): Config2Assessment {
  const active = equipment.filter((item) => item.lifecycle === 'ACTIVE');
  const panels = new Set(active.filter((e) => e.equipmentType === 'PANEL').map((e) => e.id));
  const ports = active.flatMap((e) => e.accessPorts.filter(isIncoming));
  const missingFeedPositions: ('A' | 'B')[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const side of ['A', 'B'] as const) {
    const group = ports.filter((port) => port.attributes?.feed === side);
    if (!group.length) {
      missingFeedPositions.push(side);
      continue;
    }
    if (group.length !== 1) {
      issues.push(`DUPLICATE_INPUT_${side}`);
      continue;
    }
    const port = group[0]!;
    if (port.attributes?.independentInputConfirmed !== true)
      issues.push(`SHUNT_NOT_VERIFIED_${side}`);
    if (config4FeedPosition(port)) issues.push(`WRONG_FEED_POSITION_${side}`);
    const linked = port.attributes?.servedPanelIds;
    if (
      !Array.isArray(linked) ||
      linked.length !== 2 ||
      linked.some((id) => typeof id !== 'string' || !panels.has(id))
    ) {
      issues.push(`PANEL_MAPPING_INCOMPLETE_${side}`);
    } else {
      for (const id of linked) {
        if (seen.has(id)) issues.push('DUPLICATE_PANEL_MAPPING');
        seen.add(id);
      }
    }
  }
  if (ports.some((p) => p.attributes?.feed !== 'A' && p.attributes?.feed !== 'B'))
    issues.push('UNIDENTIFIED_INPUT_FEEDS');
  if (ports.length !== 2) issues.push('EXPECTED_TWO_INPUTS');
  if (panels.size !== 4) issues.push('EXPECTED_FOUR_PANELS');
  return {
    hardwareProfile: ELTEK_BDCBB_CONFIG_2,
    expectedFeedCount: 2,
    inventoriedFeedCount: ports.length,
    missingFeedPositions,
    issues: [...new Set(issues)],
    inventoryComplete: missingFeedPositions.length === 0 && issues.length === 0,
  };
}
export type BdfbInventoryAssessment = Config2Assessment | Config4Assessment;
export function assessBdfbInventory(
  profile: BdfbHardwareProfile,
  equipment: readonly EquipmentNode[],
): BdfbInventoryAssessment {
  return profile === ELTEK_BDCBB_CONFIG_2
    ? assessConfig2Inventory(equipment)
    : assessConfig4Inventory(equipment);
}
