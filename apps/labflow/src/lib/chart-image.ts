import { buildChart, type Point } from './chart';
import { Canvas } from './png';

/** LabFlow's accent and neutrals, as RGB for the raster canvas. */
const ACCENT: [number, number, number] = [37, 78, 168];
const LINE: [number, number, number] = [214, 218, 226];
const AXIS: [number, number, number] = [140, 148, 162];

/**
 * Renders a plot as a PNG for embedding in an exported deck.
 *
 * No text is drawn — axis labels and ranges go in the slide's own text, which
 * keeps this a few dozen lines instead of a font rasteriser.
 */
export function renderChartPng(
  points: Point[],
  options: { width?: number; height?: number; connect?: boolean } = {},
): Buffer | null {
  const width = options.width ?? 960;
  const height = options.height ?? 480;
  const chart = buildChart(points, width, height);
  if (!chart) return null;

  const canvas = new Canvas(width, height);
  const { plot } = chart;

  for (const tick of chart.yTicks) {
    canvas.line(plot.left, tick.position, plot.left + plot.width, tick.position, LINE);
  }
  canvas.line(plot.left, plot.top, plot.left, plot.top + plot.height, AXIS);
  canvas.line(
    plot.left,
    plot.top + plot.height,
    plot.left + plot.width,
    plot.top + plot.height,
    AXIS,
  );

  if (options.connect) {
    for (let i = 1; i < chart.points.length; i++) {
      const a = chart.points[i - 1]!;
      const b = chart.points[i]!;
      canvas.line(a.cx, a.cy, b.cx, b.cy, ACCENT);
    }
  }
  for (const p of chart.points) canvas.disc(p.cx, p.cy, 4, ACCENT);

  return canvas.toPng();
}
