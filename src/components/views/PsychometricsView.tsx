import type { BehavioralAnalysisReport } from '../../engine/types';
import {
  formatDurationDays,
  formatInr,
  formatPValue,
  formatPct,
} from '../../utils/formatters';
import { OvertradingScatterChart } from '../charts/OvertradingScatterChart';
import { ProspectCurveChart } from '../charts/ProspectCurveChart';

interface PsychometricsViewProps {
  report: BehavioralAnalysisReport;
}

export function PsychometricsView({ report }: PsychometricsViewProps) {
  const { disposition, prospectTheory, overtrading, revengeTrading } = report;

  const pgrPct = Math.min(100, disposition.pgr * 100);
  const plrPct = Math.min(100, disposition.plr * 100);
  const maxHold = Math.max(0.1, disposition.avgWinHoldingDays, disposition.avgLossHoldingDays);

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Quantitative Behavioral Psychometrics
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Deterministic mathematical diagnostics computed locally from your FIFO execution ledger and daily market prices.
        </p>
      </div>

      {/* Section 1: Disposition Effect (Odean 1998) */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              01. Disposition Effect — Odean (1998) PGR vs. PLR
            </h2>
            <p className="text-xs text-slate-500">
              Market-marked open portfolio paper gains/losses evaluated on {disposition.marketEvaluationCoveragePct}% of concurrent holding checkpoints.
            </p>
          </div>
          <div className="font-mono text-xs font-medium tabular-nums text-slate-700">
            Z = {disposition.zScore.toFixed(2)} · p = {formatPValue(disposition.pValue)} ·{' '}
            <span className={disposition.isStatisticallySignificant ? 'text-amber-700' : 'text-slate-600'}>
              {disposition.isStatisticallySignificant ? 'Significant (p < 0.05)' : 'Not significant'}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-700">
              Realization Propensity (Proportion of Gains vs. Losses Realized)
            </h3>

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-800">
                  PGR — Gains Realized ({disposition.realizedGains} realized / {disposition.realizedGains + disposition.paperGains} total)
                </span>
                <span className="font-mono font-semibold tabular-nums text-emerald-700">
                  {pgrPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                <div className="h-full bg-emerald-600" style={{ width: `${Math.max(2, pgrPct)}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-800">
                  PLR — Losses Realized ({disposition.realizedLosses} realized / {disposition.realizedLosses + disposition.paperLosses} total)
                </span>
                <span className="font-mono font-semibold tabular-nums text-rose-700">
                  {plrPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                <div className="h-full bg-rose-600" style={{ width: `${Math.max(2, plrPct)}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 font-mono text-xs tabular-nums">
              <div>
                <div className="text-slate-500">Spread (PGR−PLR)</div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {disposition.dispositionSpread >= 0 ? '+' : ''}
                  {(disposition.dispositionSpread * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500">Ratio (PGR/PLR)</div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {disposition.dispositionRatio.toFixed(2)}×
                </div>
              </div>
              <div>
                <div className="text-slate-500">Est. Drag</div>
                <div className="mt-1 text-base font-semibold text-rose-700">
                  {formatInr(disposition.dispositionDragInr)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-5 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
            <h3 className="text-xs font-semibold text-slate-700">
              Holding Duration Asymmetry
            </h3>

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-800">
                  Winning Trades (Mean {formatDurationDays(disposition.avgWinHoldingDays)} · Median{' '}
                  {formatDurationDays(disposition.medianWinHoldingDays)})
                </span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {formatDurationDays(disposition.avgWinHoldingDays)}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                <div
                  className="h-full bg-teal-700"
                  style={{ width: `${(disposition.avgWinHoldingDays / maxHold) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-800">
                  Losing Trades (Mean {formatDurationDays(disposition.avgLossHoldingDays)} · Median{' '}
                  {formatDurationDays(disposition.medianLossHoldingDays)})
                </span>
                <span className="font-mono font-semibold tabular-nums text-amber-800">
                  {formatDurationDays(disposition.avgLossHoldingDays)}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                <div
                  className="h-full bg-amber-600"
                  style={{ width: `${(disposition.avgLossHoldingDays / maxHold) * 100}%` }}
                />
              </div>
            </div>

            <p className="border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-600">
              Holding Ratio <span className="font-mono font-semibold text-slate-900">{disposition.holdingAsymmetryRatio.toFixed(2)}×</span>{' '}
              {disposition.holdingAsymmetryRatio > 1.25
                ? 'indicates risk-seeking behavior when underwater: positions are kept open past normal stop horizons hoping to break even.'
                : 'shows balanced stop-loss discipline relative to profit-taking duration.'}
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Prospect Theory & Post-Loss Revenge Trading */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              02. Prospect Theory Value Function
            </h2>
            <p className="text-xs text-slate-500">
              Calibrated sensitivity exponents (α = {prospectTheory.gainCurvatureAlpha}, β ={' '}
              {prospectTheory.lossCurvatureBeta}) and implied loss aversion λ.
            </p>
          </div>

          <div className="mt-4">
            <ProspectCurveChart metrics={prospectTheory} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 font-mono text-xs tabular-nums sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Implied λ</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {prospectTheory.impliedLambda.toFixed(2)}×
              </div>
            </div>
            <div>
              <div className="text-slate-500">Avg Win</div>
              <div className="mt-1 text-sm font-semibold text-emerald-700">
                {formatInr(prospectTheory.avgWinnerInr)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Avg Loss</div>
              <div className="mt-1 text-sm font-semibold text-rose-700">
                -{formatInr(prospectTheory.avgLoserInr)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Tail Ratio P95</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {prospectTheory.tailRiskRatio.toFixed(2)}×
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Post-Loss Revenge Trading Markov Matrix */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              03. Post-Loss Markov Transition &amp; Revenge Sizing
            </h2>
            <p className="text-xs text-slate-500">
              Conditional probability, return expectancy, and sizing shifts conditioned on previous trade outcome.
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 font-medium">Prior Trade State</th>
                  <th className="py-2 text-right font-medium">Transitions</th>
                  <th className="py-2 text-right font-medium">Next Win %</th>
                  <th className="py-2 text-right font-medium">Avg Return</th>
                  <th className="py-2 text-right font-medium">Size vs Median</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                <tr>
                  <td className="py-3 font-sans font-medium text-emerald-800">After a Win</td>
                  <td className="py-3 text-right text-slate-700">
                    {revengeTrading.transitionMatrix.afterWin.count}
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-900">
                    {formatPct(revengeTrading.transitionMatrix.afterWin.nextWinProb)}
                  </td>
                  <td className="py-3 text-right text-slate-700">
                    {formatPct(revengeTrading.transitionMatrix.afterWin.avgReturnPct, true, 2)}
                  </td>
                  <td className="py-3 text-right text-slate-700">
                    {revengeTrading.transitionMatrix.afterWin.avgSizeRatio.toFixed(2)}×
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-sans font-medium text-rose-800">After a Loss</td>
                  <td className="py-3 text-right text-slate-700">
                    {revengeTrading.transitionMatrix.afterLoss.count}
                  </td>
                  <td className="py-3 text-right font-semibold text-rose-700">
                    {formatPct(revengeTrading.transitionMatrix.afterLoss.nextWinProb)}
                  </td>
                  <td className="py-3 text-right text-rose-700">
                    {formatPct(revengeTrading.transitionMatrix.afterLoss.avgReturnPct, true, 2)}
                  </td>
                  <td className="py-3 text-right font-semibold text-amber-800">
                    {revengeTrading.transitionMatrix.afterLoss.avgSizeRatio.toFixed(2)}×
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 font-mono text-xs tabular-nums sm:grid-cols-3">
            <div>
              <div className="text-slate-500">Median Wait (All)</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {revengeTrading.medianHoursBetweenTrades.toFixed(1)} hrs
              </div>
            </div>
            <div>
              <div className="text-slate-500">Wait After Loss</div>
              <div className="mt-1 text-sm font-semibold text-amber-800">
                {revengeTrading.medianHoursAfterLoss.toFixed(1)} hrs ({revengeTrading.timeCompressionRatio.toFixed(1)}× faster)
              </div>
            </div>
            <div>
              <div className="text-slate-500">Revenge Cost</div>
              <div className="mt-1 text-sm font-semibold text-rose-700">
                {formatInr(revengeTrading.revengeCostInr)} ({revengeTrading.revengeTradesCount} trades)
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Section 4: Overtrading & Friction Drag */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            04. Overtrading Regression &amp; Session Frequency Buckets
          </h2>
          <p className="text-xs text-slate-500">
            Ordinary Least Squares (OLS) regression of daily trade frequency against session return %, paired with Indian statutory fee drag.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <OvertradingScatterChart metrics={overtrading} />
          </div>

          <div className="lg:col-span-6">
            <h3 className="text-xs font-semibold text-slate-700">
              Performance Stratified by Daily Trade Volume
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">Frequency Bucket</th>
                    <th className="py-2 text-right font-medium">Sessions</th>
                    <th className="py-2 text-right font-medium">Win Rate</th>
                    <th className="py-2 text-right font-medium">Avg Day P&amp;L</th>
                    <th className="py-2 text-right font-medium">Total P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {overtrading.frequencyBuckets.map((b) => (
                    <tr key={b.bucketLabel}>
                      <td className="py-2.5 font-sans font-medium text-slate-900">
                        {b.bucketLabel}
                      </td>
                      <td className="py-2.5 text-right text-slate-700">{b.sessionsCount}</td>
                      <td className="py-2.5 text-right text-slate-700">{formatPct(b.winRate)}</td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          b.avgSessionNetPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatInr(b.avgSessionNetPnl, true)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-semibold ${
                          b.totalNetPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatInr(b.totalNetPnl, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600 font-mono tabular-nums">
              <span>Total Turnover: {formatInr(overtrading.totalTurnoverInr)}</span>
              <span>Optimal Daily Cap: ≤ {overtrading.optimalDailyTradeCap} trades</span>
              <span className="text-rose-700">
                Excess Cost: {formatInr(overtrading.overtradingExcessCostInr)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
