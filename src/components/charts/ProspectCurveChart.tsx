import type { ProspectTheoryMetrics } from '../../engine/types';

interface ProspectCurveChartProps {
  metrics: ProspectTheoryMetrics;
}

export function ProspectCurveChart({ metrics }: ProspectCurveChartProps) {
  const width = 480;
  const height = 260;
  const pad = { top: 20, right: 20, bottom: 28, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const pts = metrics.valueCurvePoints;
  const maxAbsV = Math.max(
    100,
    ...pts.map((p) => Math.abs(p.v)),
    Math.abs(-metrics.impliedLambda * Math.pow(100, metrics.lossCurvatureBeta))
  );

  const xScale = (x: number) => pad.left + ((x + 100) / 200) * plotW;
  const yScale = (v: number) => pad.top + ((maxAbsV - v) / (2 * maxAbsV)) * plotH;

  const originX = xScale(0);
  const originY = yScale(0);

  const empiricalPath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.x).toFixed(1)},${yScale(p.v).toFixed(1)}`)
    .join(' ');

  // Rational linear symmetric benchmark: v(x) = x scaled cleanly
  const rationalPath = `M${xScale(-100).toFixed(1)},${yScale(-100).toFixed(1)} L${xScale(100).toFixed(1)},${yScale(100).toFixed(1)}`;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
            <span className="inline-block h-0.5 w-3.5 bg-teal-700" aria-hidden="true" />
            Your Value Curve (λ = {metrics.impliedLambda.toFixed(2)})
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className="inline-block h-0.5 w-3.5 border-b border-dashed border-slate-400" aria-hidden="true" />
            Rational Linear (λ = 1.00)
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label="Kahneman-Tversky Prospect Theory Value Function"
      >
        {/* Axes */}
        <line x1={pad.left} y1={originY} x2={width - pad.right} y2={originY} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={originX} y1={pad.top} x2={originX} y2={height - pad.bottom} stroke="#CBD5E1" strokeWidth="1" />

        {/* Quadrant labels */}
        <text x={width - pad.right - 4} y={originY - 8} textAnchor="end" className="fill-slate-500 text-[10px]">
          Gains (+x)
        </text>
        <text x={pad.left + 4} y={originY + 14} textAnchor="start" className="fill-slate-500 text-[10px]">
          Losses (-x)
        </text>
        <text x={originX + 6} y={pad.top + 10} textAnchor="start" className="fill-slate-500 text-[10px]">
          +Utility v(x)
        </text>
        <text x={originX + 6} y={height - pad.bottom - 4} textAnchor="start" className="fill-rose-600 text-[10px]">
          Loss Pain (-λ|x|^β)
        </text>

        {/* Rational baseline */}
        <path d={rationalPath} fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 4" />

        {/* Empirical S-Curve */}
        <path d={empiricalPath} fill="none" stroke="#0F766E" strokeWidth="2.5" />

        {/* Highlight asymmetry at +/- 100 */}
        <circle cx={xScale(100)} cy={yScale(pts[pts.length - 1].v)} r="3.5" fill="#16A34A" />
        <circle cx={xScale(-100)} cy={yScale(pts[0].v)} r="3.5" fill="#DC2626" />
      </svg>
    </div>
  );
}
