import { describe, expect, it } from 'vitest';
import { buildChart, niceStep } from './chart';

describe('niceStep', () => {
  it('rounds to 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(1, 4)).toBe(0.5);
    expect(niceStep(37, 4)).toBe(10);
  });

  it('never returns zero for a degenerate range', () => {
    expect(niceStep(0, 5)).toBe(1);
  });
});

describe('buildChart', () => {
  it('maps data coordinates into the plot area', () => {
    const chart = buildChart(
      [
        { x: 0, y: 0 },
        { x: 10, y: 100 },
      ],
      400,
      200,
    );
    expect(chart).not.toBeNull();
    const first = chart!.points[0]!;
    const last = chart!.points[1]!;
    expect(first.cx).toBeCloseTo(chart!.plot.left);
    expect(last.cx).toBeCloseTo(chart!.plot.left + chart!.plot.width);
    // y grows upward in data space, downward in SVG space.
    expect(first.cy).toBeGreaterThan(last.cy);
  });

  it('sorts points by x so the connecting path does not zigzag', () => {
    const chart = buildChart(
      [
        { x: 5, y: 1 },
        { x: 1, y: 2 },
      ],
      400,
      200,
    );
    expect(chart!.points.map((p) => p.x)).toEqual([1, 5]);
  });

  it('gives a flat series a visible band instead of dividing by zero', () => {
    const chart = buildChart(
      [
        { x: 1, y: 7 },
        { x: 2, y: 7 },
      ],
      400,
      200,
    );
    expect(chart!.points.every((p) => Number.isFinite(p.cy))).toBe(true);
  });

  it('returns null when nothing is plottable', () => {
    expect(buildChart([], 400, 200)).toBeNull();
    expect(buildChart([{ x: Number.NaN, y: 1 }], 400, 200)).toBeNull();
  });
});
