import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseBrokerCsv } from '../engine/csvParser';
import { matchFifoRoundTrips } from '../engine/fifoMatcher';
import {
  fetchMarketHistoryForSymbols,
  getStoredAlphaVantageKey,
  setStoredAlphaVantageKey,
} from '../engine/marketData';
import { runBehavioralAnalysis } from '../engine/psychometrics';
import { SAMPLE_DATASETS } from '../engine/sampleDatasets';
import type {
  BehavioralAnalysisReport,
  ColumnMapping,
  CsvParseResult,
  SymbolMarketSeries,
} from '../engine/types';

export type MarketFetchStatus = 'idle' | 'loading' | 'ready' | 'offline';

export interface AnalyzerState {
  sourceLabel: string;
  rawCsvText: string;
  parseResult: CsvParseResult | null;
  report: BehavioralAnalysisReport | null;
  marketStatus: MarketFetchStatus;
  marketProvider: 'yahoo-finance' | 'alpha-vantage' | 'offline';
  marketSeriesMap: Record<string, SymbolMarketSeries>;
  resolvedSymbolsCount: number;
  requestedSymbolsCount: number;
  alphaVantageKey: string;
  errorMessage: string | null;
}

export function useTradeAnalyzer() {
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [marketSeriesMap, setMarketSeriesMap] = useState<Record<string, SymbolMarketSeries>>({});
  const [marketStatus, setMarketStatus] = useState<MarketFetchStatus>('idle');
  const [marketProvider, setMarketProvider] = useState<'yahoo-finance' | 'alpha-vantage' | 'offline'>(
    'yahoo-finance'
  );
  const [resolvedSymbolsCount, setResolvedSymbolsCount] = useState(0);
  const [requestedSymbolsCount, setRequestedSymbolsCount] = useState(0);
  const [alphaVantageKey, setAlphaVantageKeyState] = useState<string>(() =>
    getStoredAlphaVantageKey()
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const matched = useMemo(() => {
    if (!parseResult || parseResult.executions.length === 0) {
      return null;
    }
    return matchFifoRoundTrips(parseResult.executions);
  }, [parseResult]);

  const report = useMemo(() => {
    if (!matched || (matched.trades.length === 0 && matched.openPositions.length === 0)) {
      return null;
    }
    return runBehavioralAnalysis(matched.trades, matched.openPositions, marketSeriesMap);
  }, [matched, marketSeriesMap]);

  const loadMarketDataForExecutions = useCallback(
    async (parsed: CsvParseResult, overrideAvKey?: string) => {
      if (parsed.executions.length === 0) return;
      const symbols = Array.from(new Set(parsed.executions.map((e) => e.symbol)));
      const dates = parsed.executions.map((e) => e.tradeDate).sort();
      const fromDate = dates[0];
      const toDate = dates[dates.length - 1];

      setMarketStatus('loading');
      const res = await fetchMarketHistoryForSymbols(
        symbols,
        fromDate,
        toDate,
        overrideAvKey ?? alphaVantageKey
      );
      setMarketSeriesMap(res.seriesMap);
      setMarketProvider(res.provider);
      setResolvedSymbolsCount(res.resolvedCount);
      setRequestedSymbolsCount(res.requestedCount);
      setMarketStatus(res.provider === 'offline' ? 'offline' : 'ready');
    },
    [alphaVantageKey]
  );

  const analyzeCsvText = useCallback(
    async (csvText: string, label: string, overrideMapping?: ColumnMapping) => {
      setErrorMessage(null);
      const parsed = parseBrokerCsv(csvText, overrideMapping);
      setRawCsvText(csvText);
      setSourceLabel(label);
      setParseResult(parsed);

      if (parsed.needsManualMapping) {
        setMarketSeriesMap({});
        setMarketStatus('idle');
        return;
      }

      if (parsed.executions.length === 0) {
        setErrorMessage(
          parsed.warnings[0]?.reason ?? 'No valid executed trades were found in this CSV.'
        );
        setMarketSeriesMap({});
        setMarketStatus('idle');
        return;
      }

      await loadMarketDataForExecutions(parsed);
    },
    [loadMarketDataForExecutions]
  );

  const applyManualMapping = useCallback(
    async (mapping: ColumnMapping) => {
      if (!rawCsvText) return;
      await analyzeCsvText(rawCsvText, sourceLabel || 'Uploaded CSV', mapping);
    },
    [analyzeCsvText, rawCsvText, sourceLabel]
  );

  const loadSampleDataset = useCallback(
    async (sampleId: 'zerodha-swing' | 'groww-active') => {
      const sample = SAMPLE_DATASETS.find((s) => s.id === sampleId);
      if (!sample) return;
      await analyzeCsvText(sample.csvText, sample.label);
    },
    [analyzeCsvText]
  );

  const updateAlphaVantageKey = useCallback(
    async (newKey: string) => {
      setStoredAlphaVantageKey(newKey);
      setAlphaVantageKeyState(newKey);
      if (parseResult && parseResult.executions.length > 0) {
        await loadMarketDataForExecutions(parseResult, newKey);
      }
    },
    [loadMarketDataForExecutions, parseResult]
  );

  const refreshMarketData = useCallback(async () => {
    if (parseResult && parseResult.executions.length > 0) {
      await loadMarketDataForExecutions(parseResult);
    }
  }, [loadMarketDataForExecutions, parseResult]);

  const clearAnalysis = useCallback(() => {
    setRawCsvText('');
    setSourceLabel('');
    setParseResult(null);
    setMarketSeriesMap({});
    setMarketStatus('idle');
    setResolvedSymbolsCount(0);
    setRequestedSymbolsCount(0);
    setErrorMessage(null);
  }, []);

  // Load Zerodha sample on initial mount so the user immediately sees live mathematical output + real Yahoo Finance data,
  // while keeping Upload CSV one click away.
  useEffect(() => {
    void loadSampleDataset('zerodha-swing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    sourceLabel,
    rawCsvText,
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
  };
}
