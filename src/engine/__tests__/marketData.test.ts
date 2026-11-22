import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketHistoryForSymbols } from '../marketData';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const unavailable = (symbol: string) => ({
  symbol,
  yahooSymbol: symbol,
  currency: 'INR',
  exchangeName: 'UNKNOWN',
  source: 'unavailable',
  bars: [],
});

const yahooOk = (symbol: string) => ({
  symbol,
  yahooSymbol: `${symbol}.NS`,
  currency: 'INR',
  exchangeName: 'NSE',
  source: 'yahoo-finance',
  bars: [{ date: '2025-01-02', open: 1, high: 1, low: 1, close: 1, adjClose: 1 }],
});

const avOk = () =>
  jsonResponse({
    'Time Series (Daily)': {
      '2025-01-02': { '1. open': '1', '2. high': '1', '3. low': '1', '4. close': '1' },
    },
  });

describe('fetchMarketHistoryForSymbols', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns Yahoo data and never calls Alpha Vantage when the proxy resolves tickers', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ series: { RELIANCE: yahooOk('RELIANCE'), '^NSEI': yahooOk('^NSEI') } })
    );
    const res = await fetchMarketHistoryForSymbols(['RELIANCE'], '2025-01-01', '2025-02-01', 'KEY');
    expect(res.provider).toBe('yahoo-finance');
    expect(res.resolvedCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to Alpha Vantage when the proxy is up but resolves nothing', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ series: { RELIANCE: unavailable('RELIANCE'), '^NSEI': unavailable('^NSEI') } })
      )
      .mockImplementation(async () => avOk());
    const res = await fetchMarketHistoryForSymbols(['RELIANCE'], '2025-01-01', '2025-02-01', 'KEY');
    expect(res.provider).toBe('alpha-vantage');
    expect(res.resolvedCount).toBe(2);
  });

  it('returns the empty proxy result (not offline) when Yahoo fails and there is no AV key', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ series: { RELIANCE: unavailable('RELIANCE'), '^NSEI': unavailable('^NSEI') } })
    );
    const res = await fetchMarketHistoryForSymbols(['RELIANCE'], '2025-01-01', '2025-02-01', '');
    expect(res.provider).toBe('yahoo-finance');
    expect(res.resolvedCount).toBe(0);
  });

  it('goes offline when the proxy is unreachable and there is no key', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const res = await fetchMarketHistoryForSymbols(['RELIANCE'], '2025-01-01', '2025-02-01', '');
    expect(res.provider).toBe('offline');
  });

  it('keeps the ^NSEI benchmark in Alpha Vantage mode even with 8 tickers', async () => {
    fetchMock.mockRejectedValueOnce(new Error('no proxy')).mockImplementation(async () => avOk());
    const tickers = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const res = await fetchMarketHistoryForSymbols(tickers, '2025-01-01', '2025-02-01', 'KEY');
    const avUrls = fetchMock.mock.calls.slice(1).map((c) => String(c[0]));
    expect(avUrls).toHaveLength(5);
    expect(avUrls.some((u) => u.includes('NIFTYBEES.NS'))).toBe(true);
    expect(Object.keys(res.seriesMap)).toContain('^NSEI');
    expect(res.requestedCount).toBe(9);
  });

  it('keeps the ^NSEI benchmark in the proxy request when there are 30 tickers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ series: { X: yahooOk('X') } }));
    const tickers = Array.from({ length: 30 }, (_, i) => `T${i}`);
    await fetchMarketHistoryForSymbols(tickers, '2025-01-01', '2025-02-01');
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    const sent = url.searchParams.get('symbols')!.split(',');
    expect(sent).toHaveLength(24);
    expect(sent[sent.length - 1]).toBe('^NSEI');
  });
});
