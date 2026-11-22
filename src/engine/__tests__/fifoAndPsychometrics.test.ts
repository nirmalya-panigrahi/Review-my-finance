import { describe, expect, it } from 'vitest';
import { parseBrokerCsv } from '../csvParser';
import { estimateIndianStatutoryCharges, matchFifoRoundTrips } from '../fifoMatcher';
import {
  computeDispositionEffect,
  computeOvertradingModel,
  computeRevengeTradingModel,
  estimateProspectTheory,
  runBehavioralAnalysis,
} from '../psychometrics';
import { SAMPLE_DATASETS } from '../sampleDatasets';
import type { SymbolMarketSeries } from '../types';

describe('fifoMatcher & psychometrics — Blue Pill (Happy Path)', () => {
  it('splits partial FIFO lots accurately and tracks remaining open positions', () => {
    const csv =
      'symbol,trade_type,quantity,price,trade_date,order_execution_time\n' +
      'RELIANCE,BUY,30,1200,2025-01-02,09:30:00\n' +
      'RELIANCE,BUY,20,1250,2025-01-03,10:00:00\n' +
      'RELIANCE,SELL,40,1300,2025-01-06,14:00:00\n';

    const parsed = parseBrokerCsv(csv);
    const { trades, openPositions } = matchFifoRoundTrips(parsed.executions);

    expect(trades).toHaveLength(2);
    expect(trades[0].quantity).toBe(30);
    expect(trades[0].entryPrice).toBe(1200);
    expect(trades[0].grossPnl).toBe(3000);

    expect(trades[1].quantity).toBe(10);
    expect(trades[1].entryPrice).toBe(1250);
    expect(trades[1].grossPnl).toBe(500);

    expect(openPositions).toHaveLength(1);
    expect(openPositions[0].quantity).toBe(10);
    expect(openPositions[0].avgCost).toBe(1250);
  });

  it('computes realistic Indian delivery vs intraday charges', () => {
    const intraday = estimateIndianStatutoryCharges(100_000, 101_000, true);
    const delivery = estimateIndianStatutoryCharges(100_000, 101_000, false);
    expect(intraday).toBeGreaterThan(50);
    expect(delivery).toBeGreaterThan(200);
  });

  it('detects disposition spread, revenge trading, and loss aversion on sample Zerodha tradebook', () => {
    const zerodha = SAMPLE_DATASETS.find((s) => s.id === 'zerodha-swing')!;
    const parsed = parseBrokerCsv(zerodha.csvText);
    const { trades, openPositions } = matchFifoRoundTrips(parsed.executions);

    const mockMarket: Record<string, SymbolMarketSeries> = {
      TCS: {
        symbol: 'TCS',
        yahooSymbol: 'TCS.NS',
        currency: 'INR',
        exchangeName: 'NSE',
        source: 'yahoo-finance',
        bars: [
          { date: '2025-01-07', open: 4090, high: 4110, low: 4070, close: 4095, adjClose: 4095 },
          { date: '2025-01-21', open: 4020, high: 4030, low: 3980, close: 3990, adjClose: 3990 },
          { date: '2025-02-04', open: 3960, high: 3980, low: 3940, close: 3950, adjClose: 3950 },
        ],
      },
      '^NSEI': {
        symbol: '^NSEI',
        yahooSymbol: '^NSEI',
        currency: 'INR',
        exchangeName: 'NSE',
        source: 'yahoo-finance',
        bars: [
          { date: '2025-01-06', open: 23600, high: 23700, low: 23500, close: 23650, adjClose: 23650 },
          { date: '2025-05-05', open: 24300, high: 24450, low: 24250, close: 24400, adjClose: 24400 },
        ],
      },
    };

    const report = runBehavioralAnalysis(trades, openPositions, mockMarket);

    expect(report.summary.closedTradesCount).toBe(20);
    expect(report.summary.openPositionsCount).toBe(1);
    expect(report.disposition.avgLossHoldingDays).toBeGreaterThan(
      report.disposition.avgWinHoldingDays
    );
    expect(report.disposition.pgr).toBeGreaterThan(report.disposition.plr);
    expect(report.revengeTrading.revengeTradesCount).toBeGreaterThanOrEqual(2);
    expect(report.prospectTheory.impliedLambda).toBeGreaterThan(1.2);
    expect(report.counterfactual.disciplinedNetPnl).toBeGreaterThan(report.summary.netPnl);
    expect(report.counterfactual.benchmarkReturnPct).not.toBeNull();
  });
});

describe('psychometrics — Red Pill (Degenerate & Edge Cases)', () => {
  it('produces finite, NaN-free outputs when all trades are winners or only 1 trade exists', () => {
    const csv =
      'symbol,trade_type,quantity,price,trade_date,order_execution_time\n' +
      'ITC,BUY,100,400,2025-01-10,09:30:00\n' +
      'ITC,SELL,100,420,2025-01-11,10:00:00\n';

    const parsed = parseBrokerCsv(csv);
    const { trades, openPositions } = matchFifoRoundTrips(parsed.executions);
    const report = runBehavioralAnalysis(trades, openPositions, {});

    expect(Number.isFinite(report.disposition.zScore)).toBe(true);
    expect(Number.isFinite(report.prospectTheory.impliedLambda)).toBe(true);
    expect(Number.isFinite(report.overtrading.frequencyReturnSlope)).toBe(true);
    expect(Number.isFinite(report.revengeTrading.timeCompressionRatio)).toBe(true);
    expect(report.revengeTrading.revengeTradesCount).toBe(0);
    expect(report.counterfactual.benchmarkReturnPct).toBeNull();
  });

  it('handles empty trade array gracefully in individual model functions', () => {
    const disp = computeDispositionEffect([], {});
    const pt = estimateProspectTheory([]);
    const ot = computeOvertradingModel([]);
    const rev = computeRevengeTradingModel([]);

    expect(disp.pgr).toBe(0);
    expect(disp.plr).toBe(0);
    expect(pt.impliedLambda).toBe(1);
    expect(ot.activeTradingDays).toBe(0);
    expect(rev.revengeTradesCount).toBe(0);
  });
});
