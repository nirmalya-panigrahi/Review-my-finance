import { computeBenchmarkReturnPct, getLatestMarketPrice, getClosePriceOnOrBefore } from './marketData';
import type {
  BehavioralAnalysisReport,
  DispositionMetrics,
  EquityCurvePoint,
  FrequencyBucket,
  OpenPosition,
  OvertradingMetrics,
  ProspectTheoryMetrics,
  RevengeTradingMetrics,
  RoundTripTrade,
  SymbolBreakdown,
  SymbolMarketSeries,
} from './types';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Abramowitz & Stegun two-tailed normal p-value approximation for Z-statistic.
 */
export function twoTailedNormalPValue(z: number): number {
  const absZ = Math.abs(z);
  if (absZ > 8) return 0;
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989422804014327 * Math.exp((-absZ * absZ) / 2);
  const poly =
    t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const oneTail = d * poly;
  return Number(Math.min(1, Math.max(0, 2 * oneTail)).toFixed(4));
}

/**
 * 1. Odean (1998) Disposition Effect Model
 * Reconstructs open portfolio positions on every realized exit date, evaluates paper gains/losses
 * using real Yahoo Finance / Alpha Vantage daily closes (when available), and computes PGR, PLR,
 * Disposition Spread (PGR - PLR), Z-statistic, and Holding Duration Asymmetry.
 */
export function computeDispositionEffect(
  trades: RoundTripTrade[],
  marketSeriesMap: Record<string, SymbolMarketSeries>
): DispositionMetrics {
  const winners = trades.filter((t) => t.isWinner);
  const losers = trades.filter((t) => !t.isWinner);

  const realizedGains = winners.length;
  const realizedLosses = losers.length;

  let paperGains = 0;
  let paperLosses = 0;
  let marketChecksAttempted = 0;
  let marketChecksResolved = 0;

  // Group exit dates where at least one trade was closed
  const exitDates = Array.from(new Set(trades.map((t) => t.exitDate))).sort();

  for (const exitDate of exitDates) {
    // Open positions held across this exitDate (entered on or before exitDate, exited strictly after exitDate)
    const concurrentOpen = trades.filter(
      (t) => t.entryDate <= exitDate && t.exitDate > exitDate
    );

    for (const openTrade of concurrentOpen) {
      marketChecksAttempted++;
      const series = marketSeriesMap[openTrade.symbol];
      const markPrice = getClosePriceOnOrBefore(series, exitDate);

      if (markPrice !== null) {
        marketChecksResolved++;
        const isPaperGain =
          openTrade.direction === 'LONG'
            ? markPrice > openTrade.entryPrice
            : markPrice < openTrade.entryPrice;
        if (isPaperGain) {
          paperGains++;
        } else if (markPrice !== openTrade.entryPrice) {
          paperLosses++;
        }
      } else {
        // Fallback trajectory proxy if market bars unavailable for this ticker
        const timeSpan = Math.max(1, openTrade.exitTimestampMs - openTrade.entryTimestampMs);
        const exitMs = Date.parse(`${exitDate}T15:30:00+05:30`);
        const fraction = Math.min(1, Math.max(0, (exitMs - openTrade.entryTimestampMs) / timeSpan));
        const interpolatedPrice =
          openTrade.entryPrice + (openTrade.exitPrice - openTrade.entryPrice) * fraction;
        const isPaperGain =
          openTrade.direction === 'LONG'
            ? interpolatedPrice > openTrade.entryPrice
            : interpolatedPrice < openTrade.entryPrice;
        if (isPaperGain) paperGains++;
        else paperLosses++;
      }
    }
  }

  const pgrDenom = realizedGains + paperGains;
  const plrDenom = realizedLosses + paperLosses;

  const pgr = pgrDenom > 0 ? realizedGains / pgrDenom : 0;
  const plr = plrDenom > 0 ? realizedLosses / plrDenom : 0;
  const dispositionSpread = pgr - plr;
  const dispositionRatio = plr > 0 ? pgr / plr : pgr > 0 ? 5 : 1;

  // Two-proportion Z-test (Odean 1998 standard error)
  let zScore = 0;
  if (pgrDenom > 0 && plrDenom > 0) {
    const pooledP = (realizedGains + realizedLosses) / (pgrDenom + plrDenom);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / pgrDenom + 1 / plrDenom));
    if (se > 1e-9) {
      zScore = (pgr - plr) / se;
    }
  }
  const pValue = twoTailedNormalPValue(zScore);

  const winHoldDays = winners.map((t) => t.holdingDays);
  const lossHoldDays = losers.map((t) => t.holdingDays);

  const avgWinHoldingDays = mean(winHoldDays);
  const avgLossHoldingDays = mean(lossHoldDays);
  const medianWinHoldingDays = median(winHoldDays);
  const medianLossHoldingDays = median(lossHoldDays);

  const holdingAsymmetryRatio =
    avgWinHoldingDays > 0 ? avgLossHoldingDays / avgWinHoldingDays : avgLossHoldingDays > 0 ? 2 : 1;

  // Estimate monetary disposition drag: excess loss held past median winner holding horizon
  let dispositionDragInr = 0;
  const winMedianThreshold = Math.max(0.5, medianWinHoldingDays);
  for (const loser of losers) {
    if (loser.holdingDays > winMedianThreshold * 1.5 && loser.netPnl < 0) {
      const excessRatio = Math.min(0.65, 1 - winMedianThreshold / loser.holdingDays);
      dispositionDragInr += Math.abs(loser.netPnl) * excessRatio;
    }
  }

  const marketEvaluationCoveragePct =
    marketChecksAttempted > 0
      ? Number(((marketChecksResolved / marketChecksAttempted) * 100).toFixed(1))
      : Object.values(marketSeriesMap).some((s) => s.bars.length > 0)
      ? 100
      : 0;

  return {
    realizedGains,
    paperGains,
    realizedLosses,
    paperLosses,
    pgr: Number(pgr.toFixed(4)),
    plr: Number(plr.toFixed(4)),
    dispositionSpread: Number(dispositionSpread.toFixed(4)),
    dispositionRatio: Number(dispositionRatio.toFixed(2)),
    zScore: Number(zScore.toFixed(2)),
    pValue,
    isStatisticallySignificant: pValue < 0.05 && Math.abs(dispositionSpread) > 0.02,
    avgWinHoldingDays: Number(avgWinHoldingDays.toFixed(2)),
    avgLossHoldingDays: Number(avgLossHoldingDays.toFixed(2)),
    medianWinHoldingDays: Number(medianWinHoldingDays.toFixed(2)),
    medianLossHoldingDays: Number(medianLossHoldingDays.toFixed(2)),
    holdingAsymmetryRatio: Number(holdingAsymmetryRatio.toFixed(2)),
    dispositionDragInr: Number(dispositionDragInr.toFixed(2)),
    marketEvaluationCoveragePct,
  };
}

/**
 * 2. Prospect Theory Value Function & Loss Aversion (Kahneman & Tversky 1992)
 * v(x) = x^alpha (x >= 0), -lambda * (-x)^beta (x < 0)
 */
export function estimateProspectTheory(trades: RoundTripTrade[]): ProspectTheoryMetrics {
  const winners = trades.filter((t) => t.netPnl > 0);
  const losers = trades.filter((t) => t.netPnl < 0);

  const winPnls = winners.map((t) => t.netPnl);
  const lossAbsPnls = losers.map((t) => Math.abs(t.netPnl));
  const winRets = winners.map((t) => t.returnPct);
  const lossAbsRets = losers.map((t) => Math.abs(t.returnPct));

  const avgWinnerInr = mean(winPnls);
  const avgLoserInr = mean(lossAbsPnls);
  const medianWinnerInr = median(winPnls);
  const medianLoserInr = median(lossAbsPnls);

  const payoffRatio = avgLoserInr > 0 ? avgWinnerInr / avgLoserInr : avgWinnerInr > 0 ? 3 : 1;

  const p95Win = percentile(winAbs(winPnls), 0.95);
  const p95Loss = percentile(lossAbsPnls, 0.95);
  const tailRiskRatio = p95Win > 0 ? p95Loss / p95Win : p95Loss > 0 ? 3 : 1;

  // Estimate curvature parameters from dispersion (IQR / median)
  const medWinRet = Math.max(0.25, median(winRets));
  const medLossRet = Math.max(0.25, median(lossAbsRets));

  const gainDispersion =
    winRets.length > 2 ? (percentile(winRets, 0.75) - percentile(winRets, 0.25)) / medWinRet : 0.6;
  const lossDispersion =
    lossAbsRets.length > 2
      ? (percentile(lossAbsRets, 0.75) - percentile(lossAbsRets, 0.25)) / medLossRet
      : 0.6;

  // Diminishing sensitivity exponents clamped to empirically realistic bounds [0.55, 0.98]
  const gainCurvatureAlpha = Number(Math.min(0.98, Math.max(0.55, 0.92 - gainDispersion * 0.12)).toFixed(2));
  const lossCurvatureBeta = Number(Math.min(0.98, Math.max(0.55, 0.92 - lossDispersion * 0.1)).toFixed(2));

  // Empirical implied loss aversion lambda: ratio of tolerated loss vs captured gain weighted by holding asymmetry
  const rawLambda =
    medianWinnerInr > 0
      ? (avgLoserInr / Math.max(1, avgWinnerInr)) * 1.15 + Math.max(0, tailRiskRatio - 1) * 0.35
      : losers.length > 0
      ? 2.75
      : 1.0;
  const impliedLambda = Number(Math.min(5.0, Math.max(0.65, rawLambda)).toFixed(2));

  // Monetary impact of asymmetric loss tolerance vs symmetric 1:1 risk cap
  const medianWinCap = medianWinnerInr > 0 ? medianWinnerInr : avgWinnerInr;
  const lossAversionCostInr =
    medianWinCap > 0
      ? losers.reduce((acc, l) => {
          const absLoss = Math.abs(l.netPnl);
          return acc + Math.max(0, absLoss - medianWinCap * 1.15);
        }, 0)
      : 0;

  // Generate normalized Prospect Theory S-curve points x in [-100, +100]
  const valueCurvePoints: Array<{ x: number; v: number }> = [];
  for (let x = -100; x <= 100; x += 10) {
    const v =
      x >= 0
        ? Math.pow(x, gainCurvatureAlpha)
        : -impliedLambda * Math.pow(Math.abs(x), lossCurvatureBeta);
    valueCurvePoints.push({ x, v: Number(v.toFixed(2)) });
  }

  return {
    impliedLambda,
    gainCurvatureAlpha,
    lossCurvatureBeta,
    avgWinnerInr: Number(avgWinnerInr.toFixed(2)),
    avgLoserInr: Number(avgLoserInr.toFixed(2)),
    medianWinnerInr: Number(medianWinnerInr.toFixed(2)),
    medianLoserInr: Number(medianLoserInr.toFixed(2)),
    payoffRatio: Number(payoffRatio.toFixed(2)),
    tailRiskRatio: Number(tailRiskRatio.toFixed(2)),
    lossAversionCostInr: Number(lossAversionCostInr.toFixed(2)),
    valueCurvePoints,
  };
}

function winAbs(vals: number[]): number[] {
  return vals.map((v) => Math.abs(v));
}

/**
 * 3. Overtrading, Churn & Statutory Friction Drag Model (OLS Regression)
 */
export function computeOvertradingModel(trades: RoundTripTrade[]): OvertradingMetrics {
  const byDay = new Map<string, RoundTripTrade[]>();
  for (const t of trades) {
    const arr = byDay.get(t.exitDate) ?? [];
    arr.push(t);
    byDay.set(t.exitDate, arr);
  }

  const dailyEntries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dailyScatter = dailyEntries.map(([date, dayTrades]) => {
    const netPnl = dayTrades.reduce((s, t) => s + t.netPnl, 0);
    const totalNotional = dayTrades.reduce((s, t) => s + t.notionalValue, 0);
    const returnPct = totalNotional > 0 ? (netPnl / totalNotional) * 100 : 0;
    return {
      date,
      tradeCount: dayTrades.length,
      netPnl: Number(netPnl.toFixed(2)),
      returnPct: Number(returnPct.toFixed(2)),
    };
  });

  const activeTradingDays = dailyScatter.length;
  const avgTradesPerActiveDay = activeTradingDays > 0 ? trades.length / activeTradingDays : 0;
  const maxTradesInSingleDay = dailyScatter.reduce((m, d) => Math.max(m, d.tradeCount), 0);

  const totalTurnoverInr = trades.reduce((s, t) => s + t.notionalValue * 2, 0);
  const medianCapitalPerPos = median(trades.map((t) => t.notionalValue)) || 1;
  const churnRatio = totalTurnoverInr / Math.max(1, medianCapitalPerPos * Math.max(1, activeTradingDays));

  const totalGrossAbs = trades.reduce((s, t) => s + Math.abs(t.grossPnl), 0);
  const totalCharges = trades.reduce((s, t) => s + t.estimatedCharges, 0);
  const frictionDragPctOfGross = totalGrossAbs > 0 ? (totalCharges / totalGrossAbs) * 100 : 0;

  // OLS Linear Regression: y = returnPct, x = tradeCount
  let frequencyReturnSlope = 0;
  let frequencyR2 = 0;
  if (dailyScatter.length >= 3) {
    const xs = dailyScatter.map((d) => d.tradeCount);
    const ys = dailyScatter.map((d) => d.returnPct);
    const xMean = mean(xs);
    const yMean = mean(ys);
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - xMean;
      const dy = ys[i] - yMean;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    if (denX > 1e-9) {
      frequencyReturnSlope = num / denX;
      if (denY > 1e-9) {
        frequencyR2 = (num * num) / (denX * denY);
      }
    }
  }

  const bucketDefs = [
    { bucketLabel: '1–2 trades/day', minTrades: 1, maxTrades: 2 },
    { bucketLabel: '3–4 trades/day', minTrades: 3, maxTrades: 4 },
    { bucketLabel: '5+ trades/day', minTrades: 5, maxTrades: Infinity },
  ];

  const frequencyBuckets: FrequencyBucket[] = bucketDefs.map((def) => {
    const matchingDays = dailyEntries.filter(
      ([, dt]) => dt.length >= def.minTrades && dt.length <= def.maxTrades
    );
    const dayPnls = matchingDays.map(([, dt]) => dt.reduce((s, t) => s + t.netPnl, 0));
    const allBucketTrades = matchingDays.flatMap(([, dt]) => dt);
    const wins = allBucketTrades.filter((t) => t.isWinner).length;
    const totalNetPnl = dayPnls.reduce((a, b) => a + b, 0);
    return {
      bucketLabel: def.bucketLabel,
      minTrades: def.minTrades,
      maxTrades: def.maxTrades,
      sessionsCount: matchingDays.length,
      totalNetPnl: Number(totalNetPnl.toFixed(2)),
      avgSessionNetPnl: matchingDays.length > 0 ? Number((totalNetPnl / matchingDays.length).toFixed(2)) : 0,
      winRate: allBucketTrades.length > 0 ? Number(((wins / allBucketTrades.length) * 100).toFixed(1)) : 0,
    };
  });

  // Identify optimal cap where expectancy remains positive
  let optimalDailyTradeCap = 2;
  if (frequencyBuckets[1].sessionsCount > 0 && frequencyBuckets[1].avgSessionNetPnl > 0) {
    optimalDailyTradeCap = 4;
  }
  if (frequencyBuckets[2].sessionsCount > 0 && frequencyBuckets[2].avgSessionNetPnl > frequencyBuckets[0].avgSessionNetPnl) {
    optimalDailyTradeCap = 6;
  }

  // Excess overtrading cost = net losses incurred in days exceeding optimalDailyTradeCap + excess charges
  let overtradingExcessCostInr = 0;
  for (const [, dayTrades] of dailyEntries) {
    if (dayTrades.length > optimalDailyTradeCap) {
      const excessTrades = dayTrades.slice(optimalDailyTradeCap);
      for (const et of excessTrades) {
        if (et.netPnl < 0) {
          overtradingExcessCostInr += Math.abs(et.netPnl);
        } else {
          overtradingExcessCostInr += et.estimatedCharges;
        }
      }
    }
  }

  return {
    activeTradingDays,
    avgTradesPerActiveDay: Number(avgTradesPerActiveDay.toFixed(2)),
    maxTradesInSingleDay,
    churnRatio: Number(churnRatio.toFixed(2)),
    totalTurnoverInr: Number(totalTurnoverInr.toFixed(2)),
    frictionDragPctOfGross: Number(frictionDragPctOfGross.toFixed(2)),
    frequencyReturnSlope: Number(frequencyReturnSlope.toFixed(3)),
    frequencyR2: Number(frequencyR2.toFixed(3)),
    optimalDailyTradeCap,
    overtradingExcessCostInr: Number(overtradingExcessCostInr.toFixed(2)),
    frequencyBuckets,
    dailyScatter,
  };
}

/**
 * 4. Post-Loss Revenge Trading (2-State Markov Transition & Size Escalation Model)
 */
export function computeRevengeTradingModel(trades: RoundTripTrade[]): RevengeTradingMetrics {
  const ordered = [...trades].sort((a, b) => a.exitTimestampMs - b.exitTimestampMs);
  const medianNotionalInr = median(ordered.map((t) => t.notionalValue)) || 1;

  const interTradeHoursAll: number[] = [];
  const interTradeHoursAfterLoss: number[] = [];

  const afterWinTrades: RoundTripTrade[] = [];
  const afterLossTrades: RoundTripTrade[] = [];
  const afterTwoLossTrades: RoundTripTrade[] = [];

  let consecutiveLosses = 0;
  let revengeTradesCount = 0;
  let revengeTradesNetPnl = 0;
  let revengeCostInr = 0;

  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    const sizeRatio = Number((current.notionalValue / medianNotionalInr).toFixed(2));

    if (i === 0) {
      current.postLossContext = {
        afterLoss: false,
        consecutivePriorLosses: 0,
        hoursSincePrevExit: null,
        sizeRatioVsMedian: sizeRatio,
        isRevengeCandidate: false,
      };
      consecutiveLosses = current.isWinner ? 0 : 1;
      continue;
    }

    const prev = ordered[i - 1];
    const hoursSincePrevExit = Math.max(
      0.02,
      Number(((current.entryTimestampMs - prev.exitTimestampMs) / 3600_000).toFixed(2))
    );
    interTradeHoursAll.push(hoursSincePrevExit);

    const afterLoss = !prev.isWinner;
    // Revenge trigger criteria: re-entering quickly (<= 24h after loss) AND either escalated size (>= 1.25x median) or immediate impulsive re-entry (<= 3h) after consecutive loss
    const isRevengeCandidate =
      afterLoss &&
      hoursSincePrevExit <= 24 &&
      (sizeRatio >= 1.25 || (consecutiveLosses >= 2 && hoursSincePrevExit <= 6));

    current.postLossContext = {
      afterLoss,
      consecutivePriorLosses: consecutiveLosses,
      hoursSincePrevExit,
      sizeRatioVsMedian: sizeRatio,
      isRevengeCandidate,
    };

    if (afterLoss) {
      interTradeHoursAfterLoss.push(hoursSincePrevExit);
      afterLossTrades.push(current);
      if (consecutiveLosses >= 2) {
        afterTwoLossTrades.push(current);
      }
    } else {
      afterWinTrades.push(current);
    }

    if (isRevengeCandidate) {
      revengeTradesCount++;
      revengeTradesNetPnl += current.netPnl;
      if (current.netPnl < 0) {
        revengeCostInr += Math.abs(current.netPnl);
      }
    }

    consecutiveLosses = current.isWinner ? 0 : consecutiveLosses + 1;
  }

  const baselineWinRate =
    ordered.length > 0 ? (ordered.filter((t) => t.isWinner).length / ordered.length) * 100 : 0;
  const postLossWinRate =
    afterLossTrades.length > 0
      ? (afterLossTrades.filter((t) => t.isWinner).length / afterLossTrades.length) * 100
      : baselineWinRate;
  const postTwoLossWinRate =
    afterTwoLossTrades.length > 0
      ? (afterTwoLossTrades.filter((t) => t.isWinner).length / afterTwoLossTrades.length) * 100
      : postLossWinRate;

  const postLossAvgSizeRatio =
    afterLossTrades.length > 0
      ? mean(afterLossTrades.map((t) => t.postLossContext.sizeRatioVsMedian))
      : 1;

  const medianHoursBetweenTrades = median(interTradeHoursAll);
  const medianHoursAfterLoss =
    interTradeHoursAfterLoss.length > 0 ? median(interTradeHoursAfterLoss) : medianHoursBetweenTrades;

  const timeCompressionRatio =
    medianHoursAfterLoss > 0 && medianHoursBetweenTrades > 0
      ? medianHoursBetweenTrades / medianHoursAfterLoss
      : 1;

  const buildMarkovStats = (subset: RoundTripTrade[]) => {
    if (subset.length === 0) {
      return {
        count: 0,
        nextWinProb: 0,
        nextLossProb: 0,
        avgReturnPct: 0,
        avgSizeRatio: 1,
      };
    }
    const wins = subset.filter((t) => t.isWinner).length;
    return {
      count: subset.length,
      nextWinProb: Number(((wins / subset.length) * 100).toFixed(1)),
      nextLossProb: Number((((subset.length - wins) / subset.length) * 100).toFixed(1)),
      avgReturnPct: Number(mean(subset.map((t) => t.returnPct)).toFixed(2)),
      avgSizeRatio: Number(mean(subset.map((t) => t.postLossContext.sizeRatioVsMedian)).toFixed(2)),
    };
  };

  return {
    baselineWinRate: Number(baselineWinRate.toFixed(1)),
    postLossWinRate: Number(postLossWinRate.toFixed(1)),
    postTwoLossWinRate: Number(postTwoLossWinRate.toFixed(1)),
    medianNotionalInr: Number(medianNotionalInr.toFixed(2)),
    postLossAvgSizeRatio: Number(postLossAvgSizeRatio.toFixed(2)),
    medianHoursBetweenTrades: Number(medianHoursBetweenTrades.toFixed(2)),
    medianHoursAfterLoss: Number(medianHoursAfterLoss.toFixed(2)),
    timeCompressionRatio: Number(timeCompressionRatio.toFixed(2)),
    revengeTradesCount,
    revengeTradesNetPnl: Number(revengeTradesNetPnl.toFixed(2)),
    revengeCostInr: Number(revengeCostInr.toFixed(2)),
    transitionMatrix: {
      afterWin: buildMarkovStats(afterWinTrades),
      afterLoss: buildMarkovStats(afterLossTrades),
    },
  };
}

/**
 * Full Behavioral Finance & Psychometric Pipeline
 */
export function runBehavioralAnalysis(
  rawTrades: RoundTripTrade[],
  rawOpenPositions: OpenPosition[],
  marketSeriesMap: Record<string, SymbolMarketSeries>
): BehavioralAnalysisReport {
  const trades = rawTrades.map((t) => ({ ...t, postLossContext: { ...t.postLossContext } }));
  const benchmarkSeries = marketSeriesMap['^NSEI'];

  // Enrich each trade with Nifty 50 benchmark return over exact same holding window
  for (const t of trades) {
    const benchRet = computeBenchmarkReturnPct(benchmarkSeries, t.entryDate, t.exitDate);
    t.benchmarkReturnPct = benchRet;
    t.alphaPct = benchRet !== null ? Number((t.returnPct - benchRet).toFixed(2)) : null;
  }

  // Enrich open positions with latest Yahoo/AV market price
  const openPositions: OpenPosition[] = rawOpenPositions.map((pos) => {
    const latestPrice = getLatestMarketPrice(marketSeriesMap[pos.symbol]);
    if (latestPrice === null) return { ...pos };
    const unrealizedPnl =
      pos.direction === 'LONG'
        ? (latestPrice - pos.avgCost) * pos.quantity
        : (pos.avgCost - latestPrice) * pos.quantity;
    const costBasis = pos.avgCost * pos.quantity;
    const unrealizedReturnPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
    return {
      ...pos,
      latestMarketPrice: Number(latestPrice.toFixed(2)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      unrealizedReturnPct: Number(unrealizedReturnPct.toFixed(2)),
    };
  });

  // Run the 4 core mathematical models
  const revengeTrading = computeRevengeTradingModel(trades);
  const disposition = computeDispositionEffect(trades, marketSeriesMap);
  const prospectTheory = estimateProspectTheory(trades);
  const overtrading = computeOvertradingModel(trades);

  // Summary statistics
  const winners = trades.filter((t) => t.isWinner);
  const losers = trades.filter((t) => !t.isWinner);
  const grossPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalCharges = trades.reduce((s, t) => s + t.estimatedCharges, 0);
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

  const grossProfitSum = winners.reduce((s, t) => s + t.netPnl, 0);
  const grossLossAbsSum = Math.abs(losers.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor =
    grossLossAbsSum > 0 ? grossProfitSum / grossLossAbsSum : grossProfitSum > 0 ? 9.99 : 0;

  const returnArray = trades.map((t) => t.returnPct);
  const sdRet = stdDev(returnArray);
  const sharpeLikeRatio = sdRet > 1e-6 ? mean(returnArray) / sdRet : 0;

  // Equity curve & Counterfactual simulation
  let cumGross = 0;
  let cumNet = 0;
  let cumDisciplined = 0;
  let cumBenchPnl = 0;
  let hasBenchPnl = false;
  let peakNet = 0;
  let maxDrawdownInr = 0;

  const medianSize = revengeTrading.medianNotionalInr || 1;
  const medianWinDays = Math.max(0.5, disposition.medianWinHoldingDays);

  // Count trades per day for overtrading counterfactual cap
  const dayTradeOrdinal = new Map<string, number>();

  const equityCurve: EquityCurvePoint[] = trades.map((t, index) => {
    cumGross += t.grossPnl;
    cumNet += t.netPnl;
    peakNet = Math.max(peakNet, cumNet);
    const drawdownInr = Math.max(0, peakNet - cumNet);
    maxDrawdownInr = Math.max(maxDrawdownInr, drawdownInr);

    // Disciplined counterfactual rule:
    // 1) Normalize revenge-escalated sizing back to 1.0x median size
    // 2) Cap excess losing trades past optimalDailyTradeCap
    // 3) Trim tail disposition holding drag beyond 1.5x winner median duration
    const ord = (dayTradeOrdinal.get(t.exitDate) ?? 0) + 1;
    dayTradeOrdinal.set(t.exitDate, ord);

    let cfTradePnl = t.netPnl;
    if (t.postLossContext.isRevengeCandidate && t.notionalValue > medianSize && t.netPnl < 0) {
      cfTradePnl = t.netPnl * (medianSize / t.notionalValue);
    }
    if (!t.isWinner && t.holdingDays > medianWinDays * 1.5) {
      const capFactor = Math.max(0.45, (medianWinDays * 1.5) / t.holdingDays);
      cfTradePnl = cfTradePnl * capFactor;
    }
    if (ord > overtrading.optimalDailyTradeCap && cfTradePnl < 0) {
      cfTradePnl = 0; // Disciplined daily stop avoids excess tilt losses
    }

    cumDisciplined += cfTradePnl;

    if (t.benchmarkReturnPct !== null) {
      hasBenchPnl = true;
      cumBenchPnl += t.notionalValue * (t.benchmarkReturnPct / 100);
    }

    return {
      date: t.exitDate,
      tradeIndex: index + 1,
      cumulativeGrossPnl: Number(cumGross.toFixed(2)),
      cumulativeNetPnl: Number(cumNet.toFixed(2)),
      disciplinedCounterfactualPnl: Number(cumDisciplined.toFixed(2)),
      benchmarkEquivalentPnl: hasBenchPnl ? Number(cumBenchPnl.toFixed(2)) : null,
      drawdownInr: Number(drawdownInr.toFixed(2)),
    };
  });

  const maxCapitalBase = Math.max(1, medianSize * 3);
  const maxDrawdownPct = (maxDrawdownInr / maxCapitalBase) * 100;

  const totalNotionalTraded = trades.reduce((s, t) => s + t.notionalValue, 0);
  const traderWeightedReturnPct =
    totalNotionalTraded > 0 ? (netPnl / totalNotionalTraded) * 100 : 0;

  // Overall period Nifty 50 benchmark return from first entry to last exit
  const startDate = trades.length > 0 ? trades[0].entryDate : new Date().toISOString().slice(0, 10);
  const endDate = trades.length > 0 ? trades[trades.length - 1].exitDate : startDate;
  const periodBenchmarkRet = computeBenchmarkReturnPct(benchmarkSeries, startDate, endDate);

  // Per-symbol breakdown
  const symbolGroups = new Map<string, RoundTripTrade[]>();
  for (const t of trades) {
    const arr = symbolGroups.get(t.symbol) ?? [];
    arr.push(t);
    symbolGroups.set(t.symbol, arr);
  }

  const symbolBreakdowns: SymbolBreakdown[] = Array.from(symbolGroups.entries())
    .map(([symbol, group]) => {
      const symWinners = group.filter((g) => g.isWinner);
      const symLosers = group.filter((g) => !g.isWinner);
      return {
        symbol,
        tradesCount: group.length,
        winRate: Number(((symWinners.length / group.length) * 100).toFixed(1)),
        grossPnl: Number(group.reduce((s, g) => s + g.grossPnl, 0).toFixed(2)),
        charges: Number(group.reduce((s, g) => s + g.estimatedCharges, 0).toFixed(2)),
        netPnl: Number(group.reduce((s, g) => s + g.netPnl, 0).toFixed(2)),
        avgWinHoldDays: Number(mean(symWinners.map((w) => w.holdingDays)).toFixed(2)),
        avgLossHoldDays: Number(mean(symLosers.map((l) => l.holdingDays)).toFixed(2)),
        revengeCount: group.filter((g) => g.postLossContext.isRevengeCandidate).length,
        benchmarkReturnPct: computeBenchmarkReturnPct(marketSeriesMap[symbol], startDate, endDate),
      };
    })
    .sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl));

  const behavioralLeakageTotalInr = Math.max(0, cumDisciplined - cumNet);

  return {
    summary: {
      closedTradesCount: trades.length,
      openPositionsCount: openPositions.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: trades.length > 0 ? Number(((winners.length / trades.length) * 100).toFixed(1)) : 0,
      grossPnl: Number(grossPnl.toFixed(2)),
      totalCharges: Number(totalCharges.toFixed(2)),
      netPnl: Number(netPnl.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      expectancyPerTrade: trades.length > 0 ? Number((netPnl / trades.length).toFixed(2)) : 0,
      sharpeLikeRatio: Number(sharpeLikeRatio.toFixed(2)),
      maxDrawdownInr: Number(maxDrawdownInr.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(1)),
      dateRange: { start: startDate, end: endDate },
    },
    disposition,
    prospectTheory,
    overtrading,
    revengeTrading,
    counterfactual: {
      disciplinedNetPnl: Number(cumDisciplined.toFixed(2)),
      behavioralLeakageTotalInr: Number(behavioralLeakageTotalInr.toFixed(2)),
      dispositionLeakageInr: disposition.dispositionDragInr,
      revengeLeakageInr: revengeTrading.revengeCostInr,
      overtradingLeakageInr: overtrading.overtradingExcessCostInr,
      benchmarkReturnPct: periodBenchmarkRet,
      traderWeightedReturnPct: Number(traderWeightedReturnPct.toFixed(2)),
      alphaVsNiftyPct:
        periodBenchmarkRet !== null
          ? Number((traderWeightedReturnPct - periodBenchmarkRet).toFixed(2))
          : null,
      equityCurve,
    },
    symbolBreakdowns,
    trades,
    openPositions,
  };
}
