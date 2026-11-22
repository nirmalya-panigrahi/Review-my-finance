import type { OpenPosition, RawExecution, RoundTripTrade } from './types';

interface OpenLot {
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  remainingQty: number;
  price: number;
  tradeDate: string;
  timestampMs: number;
}

/**
 * Estimates Indian equity delivery / intraday statutory + brokerage friction (Zerodha/Groww typical schedule).
 * - Intraday: 0.03% or ₹20 max per leg brokerage + 0.025% STT on sell + 0.00297% NSE tx + 18% GST + 0.003% stamp on buy
 * - Delivery: ₹0 brokerage + 0.1% STT both sides + 0.00297% NSE tx + 18% GST on tx + 0.015% stamp on buy
 */
export function estimateIndianStatutoryCharges(
  buyValue: number,
  sellValue: number,
  isIntraday: boolean
): number {
  const turnover = buyValue + sellValue;
  if (isIntraday) {
    const brokerageBuy = Math.min(20, buyValue * 0.0003);
    const brokerageSell = Math.min(20, sellValue * 0.0003);
    const brokerage = brokerageBuy + brokerageSell;
    const stt = sellValue * 0.00025;
    const exchangeTx = turnover * 0.0000297;
    const sebi = turnover * 0.000001;
    const stamp = buyValue * 0.00003;
    const gst = (brokerage + exchangeTx + sebi) * 0.18;
    return Number((brokerage + stt + exchangeTx + sebi + stamp + gst).toFixed(2));
  }

  const stt = turnover * 0.001;
  const exchangeTx = turnover * 0.0000297;
  const sebi = turnover * 0.000001;
  const stamp = buyValue * 0.00015;
  const gst = (exchangeTx + sebi) * 0.18;
  return Number((stt + exchangeTx + sebi + stamp + gst).toFixed(2));
}

/**
 * Matches chronological executions per symbol using strict FIFO queue for both Long and Short round-trips.
 */
export function matchFifoRoundTrips(executions: RawExecution[]): {
  trades: RoundTripTrade[];
  openPositions: OpenPosition[];
} {
  const sorted = [...executions].sort((a, b) => a.timestampMs - b.timestampMs);
  const queues = new Map<string, OpenLot[]>();
  const trades: RoundTripTrade[] = [];
  let tradeCounter = 1;

  for (const exec of sorted) {
    const queue = queues.get(exec.symbol) ?? [];
    let qtyLeft = exec.quantity;

    while (qtyLeft > 1e-8 && queue.length > 0) {
      const head = queue[0];
      const closesLong = head.direction === 'LONG' && exec.side === 'SELL';
      const closesShort = head.direction === 'SHORT' && exec.side === 'BUY';

      if (!closesLong && !closesShort) {
        break;
      }

      const matchedQty = Math.min(qtyLeft, head.remainingQty);
      const entryPrice = head.price;
      const exitPrice = exec.price;
      const entryNotional = matchedQty * entryPrice;
      const exitNotional = matchedQty * exitPrice;

      const grossPnl =
        head.direction === 'LONG'
          ? (exitPrice - entryPrice) * matchedQty
          : (entryPrice - exitPrice) * matchedQty;

      const holdingHours = Math.max(0.05, (exec.timestampMs - head.timestampMs) / 3600_000);
      const holdingDays = Math.max(0.01, holdingHours / 24);
      const isIntraday = head.tradeDate === exec.tradeDate;

      const buyValue = head.direction === 'LONG' ? entryNotional : exitNotional;
      const sellValue = head.direction === 'LONG' ? exitNotional : entryNotional;
      const estimatedCharges = estimateIndianStatutoryCharges(buyValue, sellValue, isIntraday);
      const netPnl = Number((grossPnl - estimatedCharges).toFixed(2));
      const returnPct = entryNotional > 0 ? Number(((netPnl / entryNotional) * 100).toFixed(2)) : 0;

      trades.push({
        id: `RT-${tradeCounter++}`,
        symbol: exec.symbol,
        exchange: exec.exchange,
        direction: head.direction,
        entryDate: head.tradeDate,
        exitDate: exec.tradeDate,
        entryTimestampMs: head.timestampMs,
        exitTimestampMs: exec.timestampMs,
        holdingHours: Number(holdingHours.toFixed(2)),
        holdingDays: Number(holdingDays.toFixed(2)),
        quantity: Number(matchedQty.toFixed(4)),
        entryPrice: Number(entryPrice.toFixed(2)),
        exitPrice: Number(exitPrice.toFixed(2)),
        notionalValue: Number(entryNotional.toFixed(2)),
        grossPnl: Number(grossPnl.toFixed(2)),
        estimatedCharges,
        netPnl,
        returnPct,
        isWinner: netPnl > 0,
        isIntraday,
        benchmarkReturnPct: null,
        alphaPct: null,
        postLossContext: {
          afterLoss: false,
          consecutivePriorLosses: 0,
          hoursSincePrevExit: null,
          sizeRatioVsMedian: 1,
          isRevengeCandidate: false,
        },
      });

      head.remainingQty -= matchedQty;
      qtyLeft -= matchedQty;
      if (head.remainingQty <= 1e-8) {
        queue.shift();
      }
    }

    if (qtyLeft > 1e-8) {
      queue.push({
        symbol: exec.symbol,
        exchange: exec.exchange,
        direction: exec.side === 'BUY' ? 'LONG' : 'SHORT',
        remainingQty: qtyLeft,
        price: exec.price,
        tradeDate: exec.tradeDate,
        timestampMs: exec.timestampMs,
      });
    }

    queues.set(exec.symbol, queue);
  }

  // Sort completed round-trips chronologically by exit timestamp
  trades.sort((a, b) => a.exitTimestampMs - b.exitTimestampMs);

  // Aggregate remaining open lots per symbol
  const openPositions: OpenPosition[] = [];
  for (const [symbol, lots] of queues.entries()) {
    if (lots.length === 0) continue;
    const totalQty = lots.reduce((acc, lot) => acc + lot.remainingQty, 0);
    if (totalQty <= 1e-8) continue;
    const weightedCost = lots.reduce((acc, lot) => acc + lot.remainingQty * lot.price, 0);
    openPositions.push({
      symbol,
      exchange: lots[0].exchange,
      direction: lots[0].direction,
      quantity: Number(totalQty.toFixed(4)),
      avgCost: Number((weightedCost / totalQty).toFixed(2)),
      entryDate: lots[0].tradeDate,
      entryTimestampMs: lots[0].timestampMs,
      latestMarketPrice: null,
      unrealizedPnl: null,
      unrealizedReturnPct: null,
    });
  }

  return { trades, openPositions };
}
