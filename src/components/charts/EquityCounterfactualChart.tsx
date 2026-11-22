import { useState } from 'react';
import type { EquityCurvePoint } from '../../engine/types';
import { formatInr } from '../../utils/formatters';

interface EquityCounterfactualChartProps {
  points: EquityCurvePoint[];
}

export function EquityCounterfactualChart({ points }: EquityCounterfactualChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        No closed round-trip trades available to plot cumulative attribution.
      </div>
    );
  }

  const width = 820;
  const height = 300;
  const pad = { top: 20, right: 24, bottom: 36, left: 74 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const allValues: number[] = [0];
  for (const p of points) {
    allValues.push(p.cumulativeNetPnl, p.disciplinedCounterfactualPnl);
    if (p.benchmarkEquivalentPnl !== null) {
      allValues.push(p.benchmarkEquivalentPnl);
    }
  }

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = Math.max(1000, maxVal - minVal);
  const yMin = minVal - range * 0.08;
  const yMax = maxVal + range * 0.08;

  const xScale = (idx: number) => {
    if (points.length === 1) return pad.left + plotW / 2;
    return pad.left + (idx / (points.length - 1)) * plotW;
  };

  const yScale = (val: number) => {
    return pad.top + ((yMax - val) / (yMax - yMin)) * plotH;
  };

  const buildPath = (getter: (p: EquityCurvePoint) => number | null): string => {
    const cmds: string[] = [];
    points.forEach((p, i) => {
      const val = getter(p);
      if (val === null) return;
      const x = xScale(i).toFixed(1);
      const y = yScale(val).toFixed(1);
      cmds.push(`${cmds.length === 0 ? 'M' : 'L'}${x},${y}`);
    });
    return cmds.join(' ');
  };

  // Leakage gap shaded polygon between disciplined counterfactual and actual net P&L
  const buildLeakageArea = (): string => {
    if (points.length < 2) return '';
    const topPts = points.map((p, i) => `${xScale(i).toFixed(1)},${yScale(p.disciplinedCounterfactualPnl).toFixed(1)}`);
    const botPts = [...points]
      .reverse()
      .map((p, revI) => {
        const origI = points.length - 1 - revI;
        return `${xScale(origI).toFixed(1)},${yScale(p.cumulativeNetPnl).toFixed(1)}`;
      });
    return `M${topPts.join(' L')} L${botPts.join(' L')} Z`;
  };

  const actualPath = buildPath((p) => p.cumulativeNetPnl);
  const cfPath = buildPath((p) => p.disciplinedCounterfactualPnl);
  const hasBenchmark = points.some((p) => p.benchmarkEquivalentPnl !== null);
  const benchPath = hasBenchmark ? buildPath((p) => p.benchmarkEquivalentPnl) : '';
  const leakageArea = buildLeakageArea();

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);
  const zeroY = yScale(0);
  const activeIdx = hoverIdx !== null ? hoverIdx : points.length - 1;
  const activePoint = points[activeIdx];

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex items-center gap-2 font-medium text-slate-900">
            <span className="inline-block h-0.5 w-4 bg-slate-900" aria-hidden="true" />
            Actual Net P&amp;L
          </span>
          <span className="inline-flex items-center gap-2 font-medium text-teal-800">
            <span className="inline-block h-0.5 w-4 bg-teal-600" aria-hidden="true" />
            Disciplined Counterfactual
          </span>
          {hasBenchmark && (
            <span className="inline-flex items-center gap-2 font-medium text-amber-800">
              <span
                className="inline-block h-0.5 w-4 border-b-2 border-dashed border-amber-600"
                aria-hidden="true"
              />
              Nifty 50 Equal-Capital
            </span>
          )}
        </div>
        {activePoint && (
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums text-slate-700">
            <span>Trade #{activePoint.tradeIndex}</span>
            <span aria-hidden="true">·</span>
            <span>{activePoint.date}</span>
            <span aria-hidden="true">·</span>
            <span>Net: {formatInr(activePoint.cumulativeNetPnl, true)}</span>
            <span aria-hidden="true">·</span>
            <span className="text-teal-700">
              Counterfactual: {formatInr(activePoint.disciplinedCounterfactualPnl, true)}
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label="Actual Net P&L versus Disciplined Counterfactual and Nifty 50 Benchmark"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal grid lines */}
          {yTicks.map((tick, idx) => {
            const y = yScale(tick);
            return (
              <g key={idx}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={width - pad.right}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[11px]"
                >
                  {formatInr(Math.round(tick))}
                </text>
              </g>
            );
          })}

          {/* Zero baseline */}
          {zeroY >= pad.top && zeroY <= height - pad.bottom && (
            <line
              x1={pad.left}
              y1={zeroY}
              x2={width - pad.right}
              y2={zeroY}
              stroke="#94A3B8"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Shaded Behavioral Leakage Band */}
          {leakageArea && <path d={leakageArea} fill="#0F766E" fillOpacity="0.09" />}

          {/* Nifty 50 Benchmark */}
          {benchPath && (
            <path
              d={benchPath}
              fill="none"
              stroke="#D97706"
              strokeWidth="1.75"
              strokeDasharray="5 4"
            />
          )}

          {/* Disciplined Counterfactual */}
          <path d={cfPath} fill="none" stroke="#0F766E" strokeWidth="2.25" />

          {/* Actual Net P&L */}
          <path d={actualPath} fill="none" stroke="#0F172A" strokeWidth="2.5" />

          {/* X-axis endpoints */}
          <text
            x={pad.left}
            y={height - 10}
            textAnchor="start"
            className="fill-slate-500 font-mono text-[11px]"
          >
            {points[0].date}
          </text>
          {points.length > 2 && (
            <text
              x={pad.left + plotW / 2}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-500 font-mono text-[11px]"
            >
              {points[Math.floor(points.length / 2)].date}
            </text>
          )}
          <text
            x={width - pad.right}
            y={height - 10}
            textAnchor="end"
            className="fill-slate-500 font-mono text-[11px]"
          >
            {points[points.length - 1].date}
          </text>

          {/* Active hover vertical marker & nodes */}
          {activePoint && (
            <g>
              <line
                x1={xScale(activeIdx)}
                y1={pad.top}
                x2={xScale(activeIdx)}
                y2={height - pad.bottom}
                stroke="#CBD5E1"
                strokeWidth="1"
              />
              <circle
                cx={xScale(activeIdx)}
                cy={yScale(activePoint.disciplinedCounterfactualPnl)}
                r="4"
                fill="#0F766E"
              />
              <circle
                cx={xScale(activeIdx)}
                cy={yScale(activePoint.cumulativeNetPnl)}
                r="4"
                fill="#0F172A"
              />
            </g>
          )}

          {/* Invisible hover columns */}
          {points.map((_, i) => {
            const colW = Math.max(8, plotW / points.length);
            const cx = xScale(i);
            return (
              <rect
                key={i}
                x={cx - colW / 2}
                y={pad.top}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
