import type { DeviceNode, Frame, Panel, Shelf } from '@/modules/topology/domain/entities';

export interface BdfbPresentation {
  readonly shelves: readonly Shelf[];
  readonly physicalShelfCount: number;
  readonly physicalFrameCount: number;
  readonly physicalPanelSlotCount: number;
  readonly configuredPanelCount: number;
  readonly isCanonicalEmulatorProjection: boolean;
}

function frameSide(frame: Frame): 'A' | 'B' | null {
  const label = frame.label.toUpperCase();
  if (/(^|\s)A($|\s)/.test(label) || frame.panels.some((panel) => /A\d/i.test(panel.label)))
    return 'A';
  if (/(^|\s)B($|\s)/.test(label) || frame.panels.some((panel) => /B\d/i.test(panel.label)))
    return 'B';
  return null;
}

function orderedPanels(side: 'A' | 'B', frame: Frame): readonly Panel[] {
  return [...frame.panels]
    .sort((left, right) => {
      const leftNumber = Number(left.label.match(/(\d+)\s*$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
      const rightNumber = Number(right.label.match(/(\d+)\s*$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
      return leftNumber - rightNumber;
    })
    .map((panel, index) => ({
      ...panel,
      label: `Panel ${side}${index + 1}`,
    }));
}

function hasEmulatorBindings(device: DeviceNode): boolean {
  const rawPoints =
    device.bdfb?.shelves.flatMap((shelf) =>
      shelf.frames.flatMap((frame) =>
        frame.panels.flatMap((panel) =>
          panel.endpoints.flatMap((endpoint) =>
            endpoint.telemetry?.rawPointId ? [endpoint.telemetry.rawPointId] : [],
          ),
        ),
      ),
    ) ?? [];

  return (
    rawPoints.length === 96 &&
    rawPoints.includes('0_1_1') &&
    rawPoints.includes('0_2_24') &&
    rawPoints.includes('0_3_1') &&
    rawPoints.includes('0_4_24')
  );
}

export function getBdfbPresentation(device: DeviceNode): BdfbPresentation {
  const shelves = device.bdfb?.shelves ?? [];
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const emulatorProfile = hasEmulatorBindings(device);

  if (emulatorProfile && frames.length === 2) {
    const frameA = frames.find((frame) => frameSide(frame) === 'A') ?? frames[0];
    const frameB = frames.find((frame) => frameSide(frame) === 'B') ?? frames[1];

    if (frameA && frameB) {
      const projectedFrames: readonly Frame[] = [
        {
          ...frameA,
          label: 'A',
          panels: orderedPanels('A', frameA),
        },
        {
          ...frameB,
          label: 'B',
          panels: orderedPanels('B', frameB),
        },
      ];
      const projectedShelf: Shelf = {
        id: `${device.id}:presentation:main-shelf`,
        label: 'Main Shelf',
        frames: projectedFrames,
      };
      const projectedPanels = projectedFrames.flatMap((frame) => frame.panels);

      return {
        shelves: [projectedShelf],
        physicalShelfCount: 1,
        physicalFrameCount: 2,
        physicalPanelSlotCount: projectedPanels.length,
        configuredPanelCount: projectedPanels.length,
        isCanonicalEmulatorProjection: true,
      };
    }
  }

  return {
    shelves,
    physicalShelfCount: shelves.length,
    physicalFrameCount: frames.length,
    physicalPanelSlotCount: panels.length,
    configuredPanelCount: panels.length,
    isCanonicalEmulatorProjection: false,
  };
}
