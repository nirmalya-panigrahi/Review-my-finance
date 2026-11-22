import { KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { BehavioralAnalysisReport, SymbolMarketSeries } from '../../engine/types';
import type { MarketFetchStatus } from '../../hooks/useTradeAnalyzer';
import { formatDurationDays, formatInr, formatPct } from '../../utils/formatters';

interface MarketContextViewProps {
  report: BehavioralAnalysisReport;
  marketStatus: MarketFetchStatus;
  marketProvider: 'yahoo-finance' | 'alpha-vantage' | 'offline';
  marketSeriesMap: Record<string, SymbolMarketSeries>;
  resolvedSymbolsCount: number;
  requestedSymbolsCount: number;
  alphaVantageKey: string;
  onUpdateAlphaVantageKey: (key: string) => Promise<void>;
  onRefreshMarketData: () => Promise<void>;
}

export function MarketContextView({
  report,
  marketStatus,
  marketProvider,
  marketSeriesMap,
  resolvedSymbolsCount,
  requestedSymbolsCount,
  alphaVantageKey,
  onUpdateAlphaVantageKey,
  onRefreshMarketData,
}: MarketContextViewProps) {
  const [keyInput, setKeyInput] = useState(alphaVantageKey);
  const [savingKey, setSavingKey] = useState(false);

  const { counterfactual, symbolBreakdowns, openPositions } = report;
  const niftySeries = marketSeriesMap['^NSEI'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Market Context &amp; Benchmark Attribution
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Historical daily OHLC prices retrieved from Yahoo Finance / Alpha Vantage to benchmark active trading against Nifty 50 and underlying buy-and-hold returns.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefreshMarketData()}
          disabled={marketStatus === 'loading'}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${marketStatus === 'loading' ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{marketStatus === 'loading' ? 'Fetching Prices...' : 'Refresh Prices'}</span>
        </button>
      </div>

      {/* Benchmark Comparison Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Market Data Feed</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {marketStatus === 'loading'
              ? 'Loading...'
              : marketProvider === 'yahoo-finance'
              ? 'Yahoo Finance'
              : marketProvider === 'alpha-vantage'
              ? 'Alpha Vantage'
              : 'Offline / Local Only'}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-600">
            {resolvedSymbolsCount} / {requestedSymbolsCount} tickers resolved
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Nifty 50 (^NSEI) Return</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {counterfactual.benchmarkReturnPct !== null
              ? formatPct(counterfactual.benchmarkReturnPct, true, 2)
              : 'Unavailable'}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {niftySeries && niftySeries.bars.length > 0
              ? `${niftySeries.bars.length} trading sessions loaded`
              : 'Connect feed for index comparison'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Capital-Weighted Return</div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              counterfactual.traderWeightedReturnPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatPct(counterfactual.traderWeightedReturnPct, true, 2)}
          </div>
          <div className="mt-1 text-xs text-slate-600">Net return across total entry notional</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Active Alpha vs Nifty 50</div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              (counterfactual.alphaVsNiftyPct ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {counterfactual.alphaVsNiftyPct !== null
              ? formatPct(counterfactual.alphaVsNiftyPct, true, 2)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600">Net return minus Nifty 50 over period</div>
        </div>
      </div>

      {/* Per-Ticker Performance vs Buy & Hold */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Symbol-Level Performance vs. Underlying Buy-and-Hold
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Compares your realized active trading net P&amp;L on each ticker against the underlying stock&apos;s buy-and-hold move over the same date span.
        </p>

        {/* Desktop Table */}
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 font-medium">Ticker</th>
                <th className="py-2.5 text-right font-medium">Trades</th>
                <th className="py-2.5 text-right font-medium">Win Rate</th>
                <th className="py-2.5 text-right font-medium">Avg Win Hold</th>
                <th className="py-2.5 text-right font-medium">Avg Loss Hold</th>
                <th className="py-2.5 text-right font-medium">Revenge</th>
                <th className="py-2.5 text-right font-medium">Stock B&amp;H %</th>
                <th className="py-2.5 text-right font-medium">Your Net P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {symbolBreakdowns.map((row) => (
                <tr key={row.symbol} className="hover:bg-slate-50/70">
                  <td className="py-2.5 font-sans font-semibold text-slate-900">{row.symbol}</td>
                  <td className="py-2.5 text-right text-slate-700">{row.tradesCount}</td>
                  <td className="py-2.5 text-right text-slate-700">{formatPct(row.winRate)}</td>
                  <td className="py-2.5 text-right text-slate-700">
                    {row.avgWinHoldDays > 0 ? formatDurationDays(row.avgWinHoldDays) : '—'}
                  </td>
                  <td className="py-2.5 text-right text-slate-700">
                    {row.avgLossHoldDays > 0 ? formatDurationDays(row.avgLossHoldDays) : '—'}
                  </td>
                  <td className="py-2.5 text-right text-amber-800">{row.revengeCount}</td>
                  <td className="py-2.5 text-right text-slate-700">
                    {row.benchmarkReturnPct !== null
                      ? formatPct(row.benchmarkReturnPct, true, 1)
                      : 'Unavailable'}
                  </td>
                  <td
                    className={`py-2.5 text-right font-semibold ${
                      row.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatInr(row.netPnl, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="mt-4 space-y-3 md:hidden">
          {symbolBreakdowns.map((row) => (
            <div key={row.symbol} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-slate-900">{row.symbol}</span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    row.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {formatInr(row.netPnl, true)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums text-slate-600">
                <span>Trades: {row.tradesCount}</span>
                <span>Win Rate: {formatPct(row.winRate)}</span>
                <span>
                  Stock B&amp;H:{' '}
                  {row.benchmarkReturnPct !== null
                    ? formatPct(row.benchmarkReturnPct, true, 1)
                    : 'N/A'}
                </span>
                <span>Revenge: {row.revengeCount}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Open Unmatched Positions Marked to Market */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Open FIFO Inventory Marked to Market
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Remaining unmatched buy/sell lots evaluated at the latest retrieved closing price.
        </p>

        {openPositions.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
            All executions in this tradebook closed cleanly into completed round-trips (0 open lots).
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 font-medium">Ticker</th>
                  <th className="py-2 font-medium">Side</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Avg Cost</th>
                  <th className="py-2 text-right font-medium">Latest Close</th>
                  <th className="py-2 text-right font-medium">Unrealized P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {openPositions.map((pos) => (
                  <tr key={pos.symbol}>
                    <td className="py-2.5 font-sans font-semibold text-slate-900">{pos.symbol}</td>
                    <td className="py-2.5 text-slate-700">{pos.direction}</td>
                    <td className="py-2.5 text-right text-slate-700">{pos.quantity}</td>
                    <td className="py-2.5 text-right text-slate-700">{formatInr(pos.avgCost)}</td>
                    <td className="py-2.5 text-right text-slate-700">
                      {pos.latestMarketPrice !== null ? formatInr(pos.latestMarketPrice) : '—'}
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        (pos.unrealizedPnl ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {pos.unrealizedPnl !== null
                        ? `${formatInr(pos.unrealizedPnl, true)} (${formatPct(
                            pos.unrealizedReturnPct ?? 0,
                            true
                          )})`
                        : 'Unavailable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Alpha Vantage Browser Fallback Key (for static GitHub Pages deployments) */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Optional Alpha Vantage Key (Static Browser Fallback)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              When running with the local server, historical NSE/BSE prices load automatically from Yahoo Finance without any API key.
              If you deploy this app as a purely static site (e.g. GitHub Pages), enter a free Alpha Vantage key here—stored strictly in your browser&apos;s{' '}
              <code className="font-mono text-[11px]">localStorage</code>.
            </p>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingKey(true);
                await onUpdateAlphaVantageKey(keyInput);
                setSavingKey(false);
              }}
            >
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Enter Alpha Vantage API key (optional)"
                aria-label="Alpha Vantage API Key"
                className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={savingKey}
                className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                {savingKey ? 'Saving...' : 'Save & Re-fetch'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
