import { describe, expect, test } from 'vitest';
import { resolveTooltipPosition } from './useTooltip';

describe('resolveTooltipPosition', () => {
  test('prefers the space above the cursor', () => {
    expect(resolveTooltipPosition({
      clientX: 400,
      clientY: 500,
      tooltipWidth: 260,
      tooltipHeight: 120,
      viewportWidth: 1024,
      viewportHeight: 768,
    })).toEqual({
      left: 414,
      top: 366,
    });
  });

  test('flips and clamps the tooltip before it leaves the viewport', () => {
    const position = resolveTooltipPosition({
      clientX: 1000,
      clientY: 750,
      tooltipWidth: 340,
      tooltipHeight: 180,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(position.left).toBe(646);
    expect(position.top).toBe(556);
    expect(position.left + 340).toBeLessThanOrEqual(1012);
    expect(position.top + 180).toBeLessThanOrEqual(756);
  });

  test('keeps the tooltip at the top edge instead of moving it below the cursor', () => {
    const position = resolveTooltipPosition({
      clientX: 300,
      clientY: 80,
      tooltipWidth: 260,
      tooltipHeight: 160,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(position.top).toBe(12);
  });
});
