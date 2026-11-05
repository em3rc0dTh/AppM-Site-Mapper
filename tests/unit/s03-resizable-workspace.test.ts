import { describe, expect, it } from 'vitest';
import { constrainWorkspaceWidths } from '@/components/workspace/resizable-workspace';

describe('S03 panel constraints', () => {
  it('preserves a usable canvas with large requested panels', () => {
    const widths = constrainWorkspaceWidths(1100, { tree: 900, inspector: 900 });
    expect(widths.tree + widths.inspector).toBeLessThanOrEqual(780);
  });
  it('rejects non-finite workspace widths', () => {
    expect(constrainWorkspaceWidths(Number.NaN, { tree: 1000, inspector: 1000 })).toEqual({
      tree: 232, inspector: 320,
    });
  });
  it('keeps desktop panel widths within configured bounds', () => {
    expect(constrainWorkspaceWidths(1400, { tree: 0, inspector: 999 })).toEqual({
      tree: 180, inspector: 520,
    });
  });
});
