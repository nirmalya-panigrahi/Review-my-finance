import type { OhlcBar, SymbolMarketSeries } from './types';

const ALPHA_VANTAGE_KEY_STORAGE = 'arthametric_av_api_key';

export function getStoredAlphaVantageKey(): string {
  try {
    return window.localStorage.getItem(ALPHA_VANTAGE_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStoredAlphaVantageKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      window.localStorage.setItem(ALPHA_VANTAGE_KEY_STORAGE, trimmed);
    } else {
      window.localStorage.removeItem(ALPHA_VANTAGE_KEY_STORAGE);
    }
  } catch {
    // Ignore storage restriction
  }
}

export function normalizeTickerForAlphaVantage(symbol: string): string {
  const cleaned = symbol
    .trim()
    .toUpperCase()
    .replace(/-(EQ|BE|BZ|SM|ST)$/i, '');
  if (cleaned === '^NSEI') return 'NIFTYBEES.NS';
  if (cleaned.endsWith('.NS') || cleaned.endsWith('.BO')) return cleaned;
  return `${cleaned}.BSE`;
}

async function fetchAlphaVantageSymbol(
  symbol: string,
  apiKey: string
): Promise<SymbolMarketSeries> {
  const avSymbol = normalizeTickerForAlphaVantage(symbol);
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
    avSymbol
  )}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      'Time Series (Daily)'?: Record<
        string,
        {
          '1. open': string;
          '2. high': string;
          '3. low': string;
          '4. close': string;
        }
      >;
      Note?: string;
      Information?: string;
      'Error Message'?: string;
    };

    const ts = json['Time Series (Daily)'];
    if (!ts) {
      return {
        symbol: symbol.toUpperCase(),
        yahooSymbol: avSymbol,
        currency: 'INR',
        exchangeName: 'BSE/NSE',
        source: 'unavailable',
        bars: [],
        error: json.Note || json.Information || json['Error Message'] || 'No Alpha Vantage bars',
      };
    }

    const bars: OhlcBar[] = Object.entries(ts)
      .map(([date, ohlc]) => {
        const close = Number(ohlc['4. close']);
        return {
          date,
          open: Number(ohlc['1. open']),
          high: Number(ohlc['2. high']),
          low: Number(ohlc['3. low']),
          close,
          adjClose: close,
        };
      })
      .filter((b) => Number.isFinite(b.close))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      symbol: symbol.toUpperCase(),
      yahooSymbol: avSymbol,
      currency: 'INR',
      exchangeName: 'BSE',
      source: 'alpha-vantage',
      bars,
    };
  } catch (err) {
    return {
      symbol: symbol.toUpperCase(),
      yahooSymbol: avSymbol,
      currency: 'INR',
      exchangeName: 'UNKNOWN',
      source: 'unavailable',
      bars: [],
      error: err instanceof Error ? err.message : 'Alpha Vantage fetch failed',
    };
  }
}

export interface MarketFetchResponse {
  provider: 'yahoo-finance' | 'alpha-vantage' | 'offline';
  seriesMap: Record<string, SymbolMarketSeries>;
  resolvedCount: number;
  requestedCount: number;
}

const BENCHMARK_SYMBOL = '^NSEI';
/** Max symbols per proxy request, benchmark included. */
const MAX_PROXY_SYMBOLS = 24;
/** Alpha Vantage free tier allows 5 calls/min, benchmark included. */
const MAX_ALPHA_VANTAGE_SYMBOLS = 5;

function countResolved(seriesMap: Record<string, SymbolMarketSeries>): number {
  return Object.values(seriesMap).filter(
    (s) => s.source !== 'unavailable' && s.bars.length > 0
  ).length;
}

/**
 * Fetches daily OHLC price history for symbols + ^NSEI benchmark.
 * Uses local Express Yahoo Finance proxy (/api/market/history) when available,
 * and falls back to browser-direct Alpha Vantage when the proxy is missing
 * (e.g. GitHub Pages) or when the proxy is up but could not resolve any ticker
 * (e.g. Yahoo rate-limiting or blocking the server).
 *
 * The ^NSEI benchmark is always reserved a slot, so it is never truncated away
 * when the user has many tickers.
 */
export async function fetchMarketHistoryForSymbols(
  symbols: string[],
  fromDate: string,
  toDate: string,
  alphaVantageKey?: string
): Promise<MarketFetchResponse> {
  const tickers = Array.from(
    new Set(
      symbols.map((s) => s.trim().toUpperCase()).filter((s) => s && s !== BENCHMARK_SYMBOL)
    )
  );
  const uniqueSymbols = [...tickers.slice(0, MAX_PROXY_SYMBOLS - 1), BENCHMARK_SYMBOL];
  const requestedCount = tickers.length + 1;

  // 1. Try Yahoo Finance proxy endpoint (available in dev/full-stack server)
  let proxyResult: MarketFetchResponse | null = null;
  try {
    const params = new URLSearchParams({
      symbols: uniqueSymbols.join(','),
      from: fromDate,
      to: toDate,
    });
    const res = await fetch(`/api/market/history?${params.toString()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as {
          series?: Record<string, SymbolMarketSeries>;
        };
        if (data.series) {
          proxyResult = {
            provider: 'yahoo-finance',
            seriesMap: data.series,
            resolvedCount: countResolved(data.series),
            requestedCount,
          };
          if (proxyResult.resolvedCount > 0) {
            return proxyResult;
          }
          // Proxy is up but Yahoo returned nothing: fall through to Alpha Vantage.
        }
      }
    }
  } catch {
    // Backend unavailable (static hosting such as GitHub Pages); check Alpha Vantage fallback
  }

  // 2. Static-mode / Yahoo-failure fallback via Alpha Vantage if user provided a free key
  const avKey = (alphaVantageKey ?? getStoredAlphaVantageKey()).trim();
  if (avKey) {
    const seriesMap: Record<string, SymbolMarketSeries> = {};
    // Free tier is limited to 5 calls/min: benchmark first-class, then the first tickers.
    const subset = [...tickers.slice(0, MAX_ALPHA_VANTAGE_SYMBOLS - 1), BENCHMARK_SYMBOL];
    for (const sym of subset) {
      seriesMap[sym] = await fetchAlphaVantageSymbol(sym, avKey);
    }
    return {
      provider: 'alpha-vantage',
      seriesMap,
      resolvedCount: countResolved(seriesMap),
      requestedCount,
    };
  }

  // 3. No key: report the proxy's (empty) result if it answered, otherwise offline.
  if (proxyResult) {
    return proxyResult;
  }

  return {
    provider: 'offline',
    seriesMap: {},
    resolvedCount: 0,
    requestedCount,
  };
}

/**
 * Binary search for the latest closing price on or before targetDate (YYYY-MM-DD).
 */
export function getClosePriceOnOrBefore(
  series: SymbolMarketSeries | undefined,
  targetDate: string
): number | null {
  if (!series || series.bars.length === 0) return null;
  const bars = series.bars;
  let lo = 0;
  let hi = bars.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= targetDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === -1) {
    return bars[0].close;
  }
  return bars[best].close;
}

export function getLatestMarketPrice(series: SymbolMarketSeries | undefined): number | null {
  if (!series || series.bars.length === 0) return null;
  return series.bars[series.bars.length - 1].close;
}

export function computeBenchmarkReturnPct(
  benchmarkSeries: SymbolMarketSeries | undefined,
  entryDate: string,
  exitDate: string
): number | null {
  if (!benchmarkSeries || benchmarkSeries.bars.length === 0) return null;
  const startPrice = getClosePriceOnOrBefore(benchmarkSeries, entryDate);
  const endPrice = getClosePriceOnOrBefore(benchmarkSeries, exitDate);
  if (!startPrice || !endPrice || startPrice <= 0) return null;
  return Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2));
}
