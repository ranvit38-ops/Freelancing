/**
 * Minimal plotting geometry.
 *
 * Charts here are a way to look at uploaded numbers, not an analysis. The
 * whole job is mapping data coordinates to SVG coordinates and choosing
 * readable ticks, so it stays a pure function with no rendering library.
 */

export type Point = { x: number; y: number };

export type ChartGeometry = {
  points: (Point & { cx: number; cy: number })[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  /** Polyline for the connected view, in SVG coordinates. */
  path: string;
  plot: { left: number; top: number; width: number; height: number };
};

const PAD = { left: 56, right: 16, top: 16, bottom: 40 };

/** "Nice" round tick step at or above the raw step (1, 2, 5 × 10ⁿ). */
export function niceStep(range: number, targetTicks: number): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const raw = range / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const factor = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return factor * magnitude;
}

function ticksFor(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step / 1000 && out.length < 20; v += step) {
    // Re-round to kill floating-point drift from repeated addition.
    out.push(Math.round(v / step) * step);
  }
  return out;
}

export function buildChart(data: Point[], width: number, height: number): ChartGeometry | null {
  const points = data.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  let [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
  // A flat series would divide by zero; give it a visible band instead.
  if (xMin === xMax) [xMin, xMax] = [xMin - 0.5, xMax + 0.5];
  if (yMin === yMax) [yMin, yMax] = [yMin - 0.5, yMax + 0.5];

  const plot = {
    left: PAD.left,
    top: PAD.top,
    width: width - PAD.left - PAD.right,
    height: height - PAD.top - PAD.bottom,
  };

  const toX = (x: number) => plot.left + ((x - xMin) / (xMax - xMin)) * plot.width;
  const toY = (y: number) => plot.top + plot.height - ((y - yMin) / (yMax - yMin)) * plot.height;

  const placed = points
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((p) => ({ ...p, cx: toX(p.x), cy: toY(p.y) }));

  return {
    points: placed,
    xTicks: ticksFor(xMin, xMax, 5).map((value) => ({ value, position: toX(value) })),
    yTicks: ticksFor(yMin, yMax, 4).map((value) => ({ value, position: toY(value) })),
    path: placed.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(2)},${p.cy.toFixed(2)}`).join(' '),
    plot,
  };
}
