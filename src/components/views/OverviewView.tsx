import { ArrowRight } from 'lucide-react';
import type { BehavioralAnalysisReport } from '../../engine/types';
import {
  formatDurationDays,
  formatInr,
  formatPValue,
  formatPct,
} from '../../utils/formatters';
import type { ActiveTab } from '../TopBar';
import { EquityCounterfactualChart } from '../charts/EquityCounterfactualChart';

interface OverviewViewProps {
  report: BehavioralAnalysisReport;
  onNavigateTab: (tab: ActiveTab) => void;
}

export function OverviewView({ report, onNavigateTab }: OverviewViewProps) {
  const { summary, disposition, prospectTheory, overtrading, revengeTrading, counterfactual } =
    report;

  const leakageBreakdown = [
    {
      label: 'Disposition Holding Drag',
      amount: counterfactual.dispositionLeakageInr,
      detail: `Losers held ${formatDurationDays(disposition.avgLossHoldingDays)} vs winners ${formatDurationDays(disposition.avgWinHoldingDays)}`,
    },
    {
      label: 'Post-Loss Revenge Sizing',
      amount: counterfactual.revengeLeakageInr,
      detail: `${revengeTrading.revengeTradesCount} rapid escalated re-entries after losses`,
    },
    {
      label: 'Overtrading & Statutory Friction',
      amount: counterfactual.overtradingLeakageInr,
      detail: `Excess trades above ${overtrading.optimalDailyTradeCap}/day + ${formatInr(summary.totalCharges)} fees`,
    },
  ];

  const totalLeakageSum = Math.max(
    1,
    leakageBreakdown.reduce((acc, item) => acc + item.amount, 0)
  );

  return (
    <div className="space-y-8">
      {/* 4-Column Executive KPI Strip */}
      <section aria-label="Primary performance and behavioral metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Realized Net P&amp;L</div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                summary.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatInr(summary.netPnl, true)}
            </div>
            <div className="mt-2 text-xs text-slate-600 tabular-nums">
              Gross {formatInr(summary.grossPnl, true)} · Charges {formatInr(summary.totalCharges)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Disciplined Counterfactual</div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-teal-800">
              {formatInr(counterfactual.disciplinedNetPnl, true)}
            </div>
            <div className="mt-2 text-xs text-slate-600 tabular-nums">
              Behavioral leakage: {formatInr(counterfactual.behavioralLeakageTotalInr)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Disposition Spread (PGR − PLR)</div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                disposition.dispositionSpread > 0.05 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {disposition.dispositionSpread >= 0 ? '+' : ''}
              {(disposition.dispositionSpread * 100).toFixed(1)}%
            </div>
            <div className="mt-2 text-xs text-slate-600 tabular-nums">
              z = {disposition.zScore.toFixed(2)} · p = {formatPValue(disposition.pValue)} ·{' '}
              {disposition.isStatisticallySignificant ? 'Statistically significant' : 'Moderate bias'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium text-slate-500">Implied Loss Aversion (λ)</div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                prospectTheory.impliedLambda > 1.75 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {prospectTheory.impliedLambda.toFixed(2)}×
            </div>
            <div className="mt-2 text-xs text-slate-600 tabular-nums">
              Rational baseline 1.00× · Payoff {prospectTheory.payoffRatio.toFixed(2)} : 1
            </div>
          </div>
        </div>
      </section>

      {/* Focal Anchor: Behaviour vs. Actual Returns */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 text-balance">
              Behavior vs. Actual Returns Attribution
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Cumulative realized net equity curve contrasted against a rule-disciplined counterfactual
              {counterfactual.benchmarkReturnPct !== null &&
                ` and Nifty 50 (${formatPct(counterfactual.benchmarkReturnPct, true)} over period)`}
              .
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600">
            Win Rate {formatPct(summary.winRate)} · Profit Factor {summary.profitFactor.toFixed(2)} · Max DD{' '}
            {formatInr(summary.maxDrawdownInr)}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <EquityCounterfactualChart points={counterfactual.equityCurve} />
          </div>

          <div className="flex flex-col justify-between border-t border-slate-100 pt-5 lg:col-span-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Modeled Behavioral Drag Decomposition
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Estimated monetary impact isolated across each mathematical bias model.
              </p>

              <div className="mt-5 space-y-5">
                {leakageBreakdown.map((item) => {
                  const sharePct = Math.min(100, (item.amount / totalLeakageSum) * 100);
                  return (
                    <div key={item.label}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-800">{item.label}</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900">
                          {formatInr(item.amount)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-slate-100">
                        <div
                          className="h-full bg-teal-700"
                          style={{ width: `${Math.max(4, sharePct)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => onNavigateTab('psychometrics')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-900"
              >
                <span>Inspect full econometric models</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Behavioral Diagnostics Summary Grid */}
      <section aria-label="Diagnostic summary">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                01. Disposition Effect (Odean 1998)
              </h3>
              <span className="font-mono text-xs font-medium tabular-nums text-slate-600">
                Ratio {disposition.dispositionRatio.toFixed(2)}×
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              You realized{' '}
              <span className="font-mono font-medium text-slate-900">
                {(disposition.pgr * 100).toFixed(1)}%
              </span>{' '}
              of available gains (PGR) versus{' '}
              <span className="font-mono font-medium text-slate-900">
                {(disposition.plr * 100).toFixed(1)}%
              </span>{' '}
              of available losses (PLR), holding losing trades{' '}
              <span className="font-mono font-medium text-slate-900">
                {disposition.holdingAsymmetryRatio.toFixed(2)}×
              </span>{' '}
              longer than winners.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                02. Post-Loss Revenge Trading (Markov)
              </h3>
              <span className="font-mono text-xs font-medium tabular-nums text-slate-600">
                {revengeTrading.revengeTradesCount} flagged
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              After a realized loss, your win rate shifts from{' '}
              <span className="font-mono font-medium text-slate-900">
                {formatPct(revengeTrading.transitionMatrix.afterWin.nextWinProb)}
              </span>{' '}
              (post-win) to{' '}
              <span className="font-mono font-medium text-rose-700">
                {formatPct(revengeTrading.transitionMatrix.afterLoss.nextWinProb)}
              </span>{' '}
              while position size scales to{' '}
              <span className="font-mono font-medium text-slate-900">
                {revengeTrading.postLossAvgSizeRatio.toFixed(2)}×
              </span>{' '}
              median notional.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                03. Prospect Theory Loss Aversion
              </h3>
              <span className="font-mono text-xs font-medium tabular-nums text-slate-600">
                λ = {prospectTheory.impliedLambda.toFixed(2)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Average winning trade nets{' '}
              <span className="font-mono font-medium text-emerald-700">
                {formatInr(prospectTheory.avgWinnerInr)}
              </span>{' '}
              compared to{' '}
              <span className="font-mono font-medium text-rose-700">
                -{formatInr(prospectTheory.avgLoserInr)}
              </span>{' '}
              on losers, with 95th-percentile tail loss ratio at{' '}
              <span className="font-mono font-medium text-slate-900">
                {prospectTheory.tailRiskRatio.toFixed(2)}×
              </span>
              .
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                04. Overtrading &amp; Statutory Friction
              </h3>
              <span className="font-mono text-xs font-medium tabular-nums text-slate-600">
                Slope {overtrading.frequencyReturnSlope >= 0 ? '+' : ''}
                {overtrading.frequencyReturnSlope.toFixed(2)}%
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Across{' '}
              <span className="font-mono font-medium text-slate-900">
                {overtrading.activeTradingDays}
              </span>{' '}
              active sessions (peak {overtrading.maxTradesInSingleDay} trades/day), brokerage &amp; STT
              consumed{' '}
              <span className="font-mono font-medium text-slate-900">
                {formatPct(overtrading.frictionDragPctOfGross)}
              </span>{' '}
              of gross absolute move.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
