import { describe, expect, it } from 'vitest';

import {
  allowedChildEquipmentTypes,
  canInstallChildType,
} from '@/components/equipment/allowed-child-equipment-types';
import { EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';

describe('Equipment child type restrictions at installation', () => {
  it('limits a BDFB Chassis to SHELF and disallows overriding a Shelf template to FRAME', () => {
    expect(allowedChildEquipmentTypes(['SHELF'])).toEqual(['SHELF']);
    expect(canInstallChildType(['SHELF'], 'SHELF')).toBe(true);
    expect(canInstallChildType(['SHELF'], 'FRAME')).toBe(false);
  });

  it('permits a Frame within a Shelf that explicitly accepts FRAME', () => {
    expect(allowedChildEquipmentTypes(['FRAME'])).toEqual(['FRAME']);
    expect(canInstallChildType(['FRAME'], 'FRAME')).toBe(true);
  });

  it('keeps unconstrained Equipment open to all valid types', () => {
    expect(allowedChildEquipmentTypes([])).toEqual(EQUIPMENT_TYPES);
    expect(canInstallChildType([], 'FRAME')).toBe(true);
    expect(canInstallChildType([], 'SHELF')).toBe(true);
  });

  it('keeps multiple allowed types without exposing incompatible overrides', () => {
    expect(allowedChildEquipmentTypes(['SHELF', 'FRAME'])).toEqual(
      EQUIPMENT_TYPES.filter((type) => type === 'SHELF' || type === 'FRAME'),
    );
    expect(canInstallChildType(['SHELF', 'FRAME'], 'PANEL')).toBe(false);
  });
});
