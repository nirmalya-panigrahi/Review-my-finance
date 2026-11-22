import { Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BehavioralAnalysisReport, RoundTripTrade } from '../../engine/types';
import { formatDurationDays, formatInr, formatPct } from '../../utils/formatters';

interface TradeLedgerViewProps {
  report: BehavioralAnalysisReport;
}

type TradeFilter = 'all' | 'winners' | 'losers' | 'revenge' | 'long-hold';

function getBehavioralFlag(trade: RoundTripTrade, medianWinDays: number): string {
  if (trade.postLossContext.isRevengeCandidate) return 'Revenge Trigger';
  if (!trade.isWinner && trade.holdingDays > Math.max(0.5, medianWinDays) * 1.5) {
    return 'Disposition Hold';
  }
  if (trade.isWinner && trade.holdingDays < 0.25) return 'Early Scalp';
  return 'Nominal';
}

export function TradeLedgerView({ report }: TradeLedgerViewProps) {
  const [filter, setFilter] = useState<TradeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const medianWinDays = report.disposition.medianWinHoldingDays;

  const filteredTrades = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return report.trades.filter((t) => {
      if (q && !t.symbol.includes(q)) return false;
      if (filter === 'winners') return t.isWinner;
      if (filter === 'losers') return !t.isWinner;
      if (filter === 'revenge') return t.postLossContext.isRevengeCandidate;
      if (filter === 'long-hold') return !t.isWinner && t.holdingDays > Math.max(0.5, medianWinDays) * 1.5;
      return true;
    });
  }, [report.trades, filter, searchQuery, medianWinDays]);

  const exportAnalyzedCsv = () => {
    const headers = [
      'TradeID',
      'Symbol',
      'Direction',
      'EntryDate',
      'ExitDate',
      'HoldingDays',
      'Quantity',
      'EntryPrice',
      'ExitPrice',
      'GrossPnlINR',
      'EstimatedChargesINR',
      'NetPnlINR',
      'ReturnPct',
      'NiftyBenchmarkPct',
      'SizeRatioVsMedian',
      'BehavioralFlag',
    ];
    const rows = filteredTrades.map((t) => [
      t.id,
      t.symbol,
      t.direction,
      t.entryDate,
      t.exitDate,
      t.holdingDays,
      t.quantity,
      t.entryPrice,
      t.exitPrice,
      t.grossPnl,
      t.estimatedCharges,
      t.netPnl,
      t.returnPct,
      t.benchmarkReturnPct ?? '',
      t.postLossContext.sizeRatioVsMedian,
      getBehavioralFlag(t, medianWinDays),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'arthametric-behavioral-ledger.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filterButtons: Array<{ id: TradeFilter; label: string }> = [
    { id: 'all', label: `All (${report.trades.length})` },
    { id: 'winners', label: `Winners (${report.summary.winningTrades})` },
    { id: 'losers', label: `Losers (${report.summary.losingTrades})` },
    { id: 'revenge', label: `Revenge (${report.revengeTrading.revengeTradesCount})` },
    { id: 'long-hold', label: 'Long Loser Holds' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            FIFO Round-Trip Trade Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Chronologically matched buy/sell lots with estimated NSE statutory charges, benchmark return, and behavioral flags.
          </p>
        </div>

        <button
          type="button"
          onClick={exportAnalyzedCsv}
          disabled={filteredTrades.length === 0}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Download Analyzed CSV</span>
        </button>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {filterButtons.map((btn) => {
            const active = filter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilter(btn.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by ticker (e.g. TCS)"
            aria-label="Filter trades by ticker"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
          />
        </div>
      </div>

      {filteredTrades.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No round-trip trades match the selected filter criteria.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Ticker</th>
                  <th className="px-4 py-3 font-medium">Entry → Exit</th>
                  <th className="px-4 py-3 text-right font-medium">Hold</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Entry / Exit</th>
                  <th className="px-4 py-3 text-right font-medium">Charges</th>
                  <th className="px-4 py-3 text-right font-medium">Net P&amp;L</th>
                  <th className="px-4 py-3 text-right font-medium">Nifty %</th>
                  <th className="px-4 py-3 font-medium">Behavioral Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {filteredTrades.map((t) => {
                  const flag = getBehavioralFlag(t, medianWinDays);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-sans font-semibold text-slate-900">
                        {t.symbol}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {t.entryDate} → {t.exitDate}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">
                        {formatDurationDays(t.holdingDays)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{t.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">
                        {t.entryPrice.toFixed(1)} / {t.exitPrice.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">
                        {formatInr(t.estimatedCharges)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${
                          t.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatInr(t.netPnl, true)} ({formatPct(t.returnPct, true, 1)})
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">
                        {t.benchmarkReturnPct !== null
                          ? formatPct(t.benchmarkReturnPct, true, 1)
                          : '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 font-sans text-xs font-medium ${
                          flag === 'Revenge Trigger'
                            ? 'text-rose-700'
                            : flag === 'Disposition Hold'
                            ? 'text-amber-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {flag}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack */}
          <div className="space-y-3 md:hidden">
            {filteredTrades.map((t) => {
              const flag = getBehavioralFlag(t, medianWinDays);
              return (
                <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">{t.symbol}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {t.entryDate} → {t.exitDate}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        t.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatInr(t.netPnl, true)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
                    <span>
                      Qty {t.quantity} · {formatDurationDays(t.holdingDays)} · {formatPct(t.returnPct, true)}
                    </span>
                    <span
                      className={`font-sans font-medium ${
                        flag === 'Revenge Trigger'
                          ? 'text-rose-700'
                          : flag === 'Disposition Hold'
                          ? 'text-amber-800'
                          : 'text-slate-600'
                      }`}
                    >
                      {flag}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
