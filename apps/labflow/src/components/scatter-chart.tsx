import { buildChart, type Point } from '@/lib/chart';
import { formatStat } from '@/lib/dataset';

/**
 * A plain SVG plot of two chosen columns. It draws the numbers as uploaded —
 * no smoothing, no fitted line, no claim about what the shape means.
 */
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  connect,
}: {
  points: Point[];
  xLabel: string;
  yLabel: string;
  connect?: boolean;
}) {
  const width = 720;
  const height = 320;
  const chart = buildChart(points, width, height);

  if (!chart) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        No rows have a number in both selected columns.
      </p>
    );
  }

  const { plot } = chart;

  return (
    <figure className="overflow-x-auto px-5 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-label={`${yLabel} plotted against ${xLabel}, ${chart.points.length} points`}
      >
        {chart.yTicks.map((tick) => (
          <g key={`y${tick.value}`}>
            <line
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={tick.position}
              y2={tick.position}
              stroke="rgb(var(--lf-line))"
              strokeWidth={1}
            />
            <text
              x={plot.left - 8}
              y={tick.position}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[rgb(var(--lf-subtle))] text-[11px]"
            >
              {formatStat(tick.value)}
            </text>
          </g>
        ))}
        {chart.xTicks.map((tick) => (
          <text
            key={`x${tick.value}`}
            x={tick.position}
            y={plot.top + plot.height + 20}
            textAnchor="middle"
            className="fill-[rgb(var(--lf-subtle))] text-[11px]"
          >
            {formatStat(tick.value)}
          </text>
        ))}
        <line
          x1={plot.left}
          x2={plot.left}
          y1={plot.top}
          y2={plot.top + plot.height}
          stroke="rgb(var(--lf-line))"
        />
        {connect ? (
          <path d={chart.path} fill="none" stroke="rgb(var(--lf-accent))" strokeWidth={1.5} />
        ) : null}
        {chart.points.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={3} className="fill-[rgb(var(--lf-accent))]">
            <title>{`${xLabel} ${formatStat(p.x)}, ${yLabel} ${formatStat(p.y)}`}</title>
          </circle>
        ))}
        <text
          x={plot.left + plot.width / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-[rgb(var(--lf-muted))] text-[12px]"
        >
          {xLabel}
        </text>
        <text
          x={14}
          y={plot.top + plot.height / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${plot.top + plot.height / 2})`}
          className="fill-[rgb(var(--lf-muted))] text-[12px]"
        >
          {yLabel}
        </text>
      </svg>
      <figcaption className="mt-2 text-xs text-subtle">
        {chart.points.length} points plotted directly from the uploaded file.
      </figcaption>
    </figure>
  );
}
