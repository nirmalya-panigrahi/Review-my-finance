import { AlertCircle, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';
import { ColumnMapper } from './components/ColumnMapper';
import { TopBar, type ActiveTab } from './components/TopBar';
import { UploadModal } from './components/UploadModal';
import { MarketContextView } from './components/views/MarketContextView';
import { MethodologyView } from './components/views/MethodologyView';
import { OverviewView } from './components/views/OverviewView';
import { PsychometricsView } from './components/views/PsychometricsView';
import { TradeLedgerView } from './components/views/TradeLedgerView';
import { useTradeAnalyzer } from './hooks/useTradeAnalyzer';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [uploadOpen, setUploadOpen] = useState(false);

  const {
    sourceLabel,
    parseResult,
    report,
    marketStatus,
    marketProvider,
    marketSeriesMap,
    resolvedSymbolsCount,
    requestedSymbolsCount,
    alphaVantageKey,
    errorMessage,
    analyzeCsvText,
    applyManualMapping,
    loadSampleDataset,
    updateAlphaVantageKey,
    refreshMarketData,
    clearAnalysis,
  } = useTradeAnalyzer();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUpload={() => setUploadOpen(true)}
      />

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {/* Workspace Context Toolbar (unboxed metadata + sample switchers) */}
        <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              Local Browser Engine
            </span>
            {sourceLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-800">{sourceLabel}</span>
              </>
            )}
            {report && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {report.summary.closedTradesCount} round-trips ({report.summary.dateRange.start} to{' '}
                  {report.summary.dateRange.end})
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {marketStatus === 'loading'
                    ? 'Fetching Yahoo Finance prices...'
                    : marketProvider === 'yahoo-finance'
                    ? `Yahoo Finance (${resolvedSymbolsCount}/${requestedSymbolsCount} tickers)`
                    : marketProvider === 'alpha-vantage'
                    ? `Alpha Vantage (${resolvedSymbolsCount}/${requestedSymbolsCount} tickers)`
                    : 'Market prices offline (local geometry active)'}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
              <button
                type="button"
                onClick={() => void loadSampleDataset('zerodha-swing')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceLabel.includes('Zerodha')
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zerodha Sample
              </button>
              <button
                type="button"
                onClick={() => void loadSampleDataset('groww-active')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceLabel.includes('Groww')
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Groww Sample
              </button>
            </div>
            {report && (
              <button
                type="button"
                onClick={clearAnalysis}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 whitespace-nowrap"
              >
                Clear Data
              </button>
            )}
          </div>
        </div>

        {/* Parse Warning / Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="mt-2 text-xs font-semibold text-rose-800 underline hover:text-rose-950"
              >
                Upload a different CSV or try a sample tradebook
              </button>
            </div>
          </div>
        )}

        {/* Manual Column Mapper when unknown CSV structure uploaded */}
        {parseResult?.needsManualMapping && (
          <div className="mb-6">
            <ColumnMapper
              headers={parseResult.headers}
              rawPreviewRows={parseResult.rawPreviewRows}
              initialMapping={parseResult.inferredMapping}
              onApplyMapping={(mapping) => void applyManualMapping(mapping)}
            />
          </div>
        )}

        {/* Skipped Rows Transparency Notice */}
        {parseResult && !parseResult.needsManualMapping && parseResult.skippedRows > 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
            Parsed {parseResult.executions.length} valid executions ({parseResult.skippedRows} non-executed or malformed rows skipped).
          </div>
        )}

        {/* Empty State */}
        {!report && !parseResult?.needsManualMapping && (
          <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-10 text-center">
            <FileSpreadsheet className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
            <h1 className="mt-4 font-display text-xl font-bold text-slate-900">
              Upload Your Broker CSV for Local Psychometric Analysis
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Analyze Zerodha Kite, Groww, or any equity tradebook CSV locally in your browser to measure Disposition Effect (PGR − PLR), Prospect Theory loss aversion (λ), overtrading drag, and post-loss revenge trading.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Upload Broker CSV</span>
              </button>
              <button
                type="button"
                onClick={() => void loadSampleDataset('zerodha-swing')}
                className="inline-flex min-h-[42px] items-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Load Zerodha Sample
              </button>
            </div>
          </section>
        )}

        {/* Active Populated Report Views */}
        {report && (
          <>
            {activeTab === 'overview' && (
              <OverviewView report={report} onNavigateTab={setActiveTab} />
            )}
            {activeTab === 'psychometrics' && <PsychometricsView report={report} />}
            {activeTab === 'market' && (
              <MarketContextView
                report={report}
                marketStatus={marketStatus}
                marketProvider={marketProvider}
                marketSeriesMap={marketSeriesMap}
                resolvedSymbolsCount={resolvedSymbolsCount}
                requestedSymbolsCount={requestedSymbolsCount}
                alphaVantageKey={alphaVantageKey}
                onUpdateAlphaVantageKey={updateAlphaVantageKey}
                onRefreshMarketData={refreshMarketData}
              />
            )}
            {activeTab === 'ledger' && <TradeLedgerView report={report} />}
            {activeTab === 'methodology' && <MethodologyView />}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>
            ArthaMetric · Mathematical Behavioral Finance &amp; Trade Psychometrics (No AI / LLM inference)
          </span>
          <span>
            All tradebooks remain in local browser memory · Historical market bars via Yahoo Finance / Alpha Vantage
          </span>
        </div>
      </footer>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadCsv={analyzeCsvText}
        onSelectSample={loadSampleDataset}
      />
    </div>
  );
}
