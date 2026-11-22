import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OhlcBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
}

interface SymbolHistoryResult {
  symbol: string;
  yahooSymbol: string;
  currency: string;
  exchangeName: string;
  source: 'yahoo-finance' | 'unavailable';
  bars: OhlcBar[];
  error?: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const priceCache = new Map<string, { expiresAt: number; data: SymbolHistoryResult }>();

const VALID_SYMBOL_RE = /^[A-Z0-9.\-^&]{1,30}$/;

function sanitizeBaseSymbol(rawSymbol: string): string {
  return rawSymbol
    .trim()
    .toUpperCase()
    .replace(/-(EQ|BE|BZ|SM|ST)$/i, '');
}

function buildCandidateYahooSymbols(rawSymbol: string): string[] {
  const cleaned = sanitizeBaseSymbol(rawSymbol);
  if (cleaned.startsWith('^') || cleaned.endsWith('.NS') || cleaned.endsWith('.BO')) {
    return [cleaned];
  }
  return [`${cleaned}.NS`, `${cleaned}.BO`];
}

async function fetchYahooChart(
  yahooSymbol: string,
  period1: number,
  period2: number
): Promise<{ bars: OhlcBar[]; currency: string; exchangeName: string } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: { currency?: string; exchangeName?: string };
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
          }>;
          adjclose?: Array<{
            adjclose?: Array<number | null>;
          }>;
        };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    return null;
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const adj = result.indicators.adjclose?.[0]?.adjclose;

  const bars: OhlcBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null || Number.isNaN(close)) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    bars.push({
      date,
      open: Number((quote.open?.[i] ?? close).toFixed(2)),
      high: Number((quote.high?.[i] ?? close).toFixed(2)),
      low: Number((quote.low?.[i] ?? close).toFixed(2)),
      close: Number(close.toFixed(2)),
      adjClose: Number((adj?.[i] ?? close).toFixed(2)),
    });
  }

  if (bars.length === 0) {
    return null;
  }

  return {
    bars,
    currency: result.meta?.currency ?? 'INR',
    exchangeName: result.meta?.exchangeName ?? 'NSE',
  };
}

async function resolveSymbolHistory(
  rawSymbol: string,
  fromDate: string,
  toDate: string
): Promise<SymbolHistoryResult> {
  const normalizedKey = sanitizeBaseSymbol(rawSymbol);
  const cacheKey = `${normalizedKey}|${fromDate}|${toDate}`;
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const fromMs = Date.parse(fromDate);
  const toMs = Date.parse(toDate);
  const period1 = Math.floor((Number.isNaN(fromMs) ? Date.now() - 365 * 86400_000 : fromMs) / 1000) - 7 * 86400;
  const period2 = Math.floor((Number.isNaN(toMs) ? Date.now() : toMs) / 1000) + 3 * 86400;

  const candidates = buildCandidateYahooSymbols(rawSymbol);
  for (const candidate of candidates) {
    try {
      const fetched = await fetchYahooChart(candidate, period1, period2);
      if (fetched) {
        const result: SymbolHistoryResult = {
          symbol: rawSymbol.trim().toUpperCase(),
          yahooSymbol: candidate,
          currency: fetched.currency,
          exchangeName: fetched.exchangeName,
          source: 'yahoo-finance',
          bars: fetched.bars,
        };
        priceCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
        return result;
      }
    } catch {
      // Try next exchange suffix
    }
  }

  const fallback: SymbolHistoryResult = {
    symbol: rawSymbol.trim().toUpperCase(),
    yahooSymbol: candidates[0] ?? rawSymbol,
    currency: 'INR',
    exchangeName: 'UNKNOWN',
    source: 'unavailable',
    bars: [],
    error: 'No historical bars returned from Yahoo Finance',
  };
  priceCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, data: fallback });
  return fallback;
}

export async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', provider: 'yahoo-finance' });
  });

  app.get('/api/market/history', async (req, res) => {
    const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : '';
    const fromParam = typeof req.query.from === 'string' ? req.query.from : '2024-01-01';
    const toParam = typeof req.query.to === 'string' ? req.query.to : new Date().toISOString().slice(0, 10);

    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0 && VALID_SYMBOL_RE.test(s))
      .slice(0, 25);

    if (symbols.length === 0) {
      res.status(400).json({ error: 'Provide at least one valid ticker symbol in ?symbols=' });
      return;
    }

    const settled = await Promise.all(
      symbols.map((symbol) => resolveSymbolHistory(symbol, fromParam, toParam))
    );

    const series: Record<string, SymbolHistoryResult> = {};
    for (const item of settled) {
      series[item.symbol] = item;
    }

    res.json({
      provider: 'yahoo-finance',
      from: fromParam,
      to: toParam,
      series,
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  return app;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const port = Number(process.env.PORT) || 3000;
  createServer().then((app) => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`ArthaMetric server listening on http://0.0.0.0:${port}`);
    });
  });
}
