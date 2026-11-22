import type { OvertradingMetrics } from '../../engine/types';

interface OvertradingScatterChartProps {
  metrics: OvertradingMetrics;
}

export function OvertradingScatterChart({ metrics }: OvertradingScatterChartProps) {
  const pts = metrics.dailyScatter;
  if (pts.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
        Insufficient session count for daily trade frequency regression.
      </div>
    );
  }

  const width = 480;
  const height = 240;
  const pad = { top: 18, right: 20, bottom: 32, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxX = Math.max(4, ...pts.map((p) => p.tradeCount));
  const minY = Math.min(-2, ...pts.map((p) => p.returnPct));
  const maxY = Math.max(2, ...pts.map((p) => p.returnPct));
  const ySpan = Math.max(1, maxY - minY);

  const xScale = (x: number) => pad.left + ((x - 0.5) / Math.max(1, maxX)) * plotW;
  const yScale = (y: number) => pad.top + ((maxY + ySpan * 0.1 - y) / (ySpan * 1.2)) * plotH;

  const zeroY = yScale(0);

  // OLS line coordinates
  const meanX = pts.reduce((s, p) => s + p.tradeCount, 0) / pts.length;
  const meanY = pts.reduce((s, p) => s + p.returnPct, 0) / pts.length;
  const regY = (x: number) => meanY + metrics.frequencyReturnSlope * (x - meanX);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
        <span>Session Trades (x) vs Daily Return % (y)</span>
        <span className="font-mono tabular-nums text-slate-700">
          Slope β₁: {metrics.frequencyReturnSlope >= 0 ? '+' : ''}
          {metrics.frequencyReturnSlope.toFixed(3)}% · R² = {metrics.frequencyR2.toFixed(3)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label="Daily Trade Frequency vs Net Return Regression"
      >
        <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="#CBD5E1" strokeDasharray="3 3" />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#E2E8F0" />
        <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#E2E8F0" />

        {/* Optimal trade cap marker */}
        <line
          x1={xScale(metrics.optimalDailyTradeCap + 0.5)}
          y1={pad.top}
          x2={xScale(metrics.optimalDailyTradeCap + 0.5)}
          y2={height - pad.bottom}
          stroke="#D97706"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* OLS Trendline */}
        {pts.length >= 3 && (
          <line
            x1={xScale(1)}
            y1={yScale(regY(1))}
            x2={xScale(maxX)}
            y2={yScale(regY(maxX))}
            stroke="#0F172A"
            strokeWidth="1.75"
          />
        )}

        {/* Scatter dots */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.tradeCount)}
            cy={yScale(p.returnPct)}
            r="4"
            fill={p.returnPct >= 0 ? '#0F766E' : '#DC2626'}
            fillOpacity="0.8"
          >
            <title>{`${p.date}: ${p.tradeCount} trades, ${p.returnPct}%`}</title>
          </circle>
        ))}

        {/* X ticks */}
        {Array.from({ length: maxX }, (_, i) => i + 1).map((tick) => (
          <text
            key={tick}
            x={xScale(tick)}
            y={height - 10}
            textAnchor="middle"
            className="fill-slate-500 font-mono text-[10px]"
          >
            {tick}
          </text>
        ))}
        <text x={pad.left - 8} y={zeroY + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px]">
          0%
        </text>
      </svg>
    </div>
  );
}
