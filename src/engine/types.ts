export type BrokerFormat = 'zerodha' | 'groww' | 'generic';

export type TradeSide = 'BUY' | 'SELL';

export type MarketSegment = 'EQ' | 'FO' | 'INTRADAY';

export interface ColumnMapping {
  symbol: string;
  side: string;
  quantity: string;
  price: string;
  tradeDate: string;
  executionTime?: string;
  exchange?: string;
  segment?: string;
  orderId?: string;
  status?: string;
}

export interface RawExecution {
  id: string;
  symbol: string;
  exchange: string;
  isin?: string;
  tradeDate: string; // YYYY-MM-DD
  executionTime: string; // HH:mm:ss
  timestampMs: number;
  side: TradeSide;
  quantity: number;
  price: number;
  tradeValue: number;
  orderId: string;
  segment: MarketSegment;
}

export interface ParseWarning {
  rowNumber: number;
  reason: string;
}

export interface CsvParseResult {
  executions: RawExecution[];
  detectedFormat: BrokerFormat;
  headers: string[];
  rawPreviewRows: string[][];
  totalRows: number;
  skippedRows: number;
  warnings: ParseWarning[];
  needsManualMapping: boolean;
  inferredMapping: Partial<ColumnMapping>;
}

export interface PostLossContext {
  afterLoss: boolean;
  consecutivePriorLosses: number;
  hoursSincePrevExit: number | null;
  sizeRatioVsMedian: number;
  isRevengeCandidate: boolean;
}

export interface RoundTripTrade {
  id: string;
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  entryDate: string;
  exitDate: string;
  entryTimestampMs: number;
  exitTimestampMs: number;
  holdingHours: number;
  holdingDays: number;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  notionalValue: number;
  grossPnl: number;
  estimatedCharges: number;
  netPnl: number;
  returnPct: number;
  isWinner: boolean;
  isIntraday: boolean;
  benchmarkReturnPct: number | null;
  alphaPct: number | null;
  postLossContext: PostLossContext;
}

export interface OpenPosition {
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  avgCost: number;
  entryDate: string;
  entryTimestampMs: number;
  latestMarketPrice: number | null;
  unrealizedPnl: number | null;
  unrealizedReturnPct: number | null;
}

export interface OhlcBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
}

export interface SymbolMarketSeries {
  symbol: string;
  yahooSymbol: string;
  currency: string;
  exchangeName: string;
  source: 'yahoo-finance' | 'alpha-vantage' | 'unavailable';
  bars: OhlcBar[];
  error?: string;
}

export interface DispositionMetrics {
  realizedGains: number;
  paperGains: number;
  realizedLosses: number;
  paperLosses: number;
  pgr: number;
  plr: number;
  dispositionSpread: number; // PGR - PLR
  dispositionRatio: number; // PGR / PLR
  zScore: number;
  pValue: number;
  isStatisticallySignificant: boolean;
  avgWinHoldingDays: number;
  avgLossHoldingDays: number;
  medianWinHoldingDays: number;
  medianLossHoldingDays: number;
  holdingAsymmetryRatio: number; // avgLossDays / avgWinDays
  dispositionDragInr: number;
  marketEvaluationCoveragePct: number;
}

export interface ProspectTheoryMetrics {
  impliedLambda: number; // Loss aversion coefficient (rational = 1.0)
  gainCurvatureAlpha: number;
  lossCurvatureBeta: number;
  avgWinnerInr: number;
  avgLoserInr: number;
  medianWinnerInr: number;
  medianLoserInr: number;
  payoffRatio: number;
  tailRiskRatio: number; // |p95 loss| / p95 gain
  lossAversionCostInr: number;
  valueCurvePoints: Array<{ x: number; v: number }>;
}

export interface FrequencyBucket {
  bucketLabel: string;
  minTrades: number;
  maxTrades: number;
  sessionsCount: number;
  totalNetPnl: number;
  avgSessionNetPnl: number;
  winRate: number;
}

export interface OvertradingMetrics {
  activeTradingDays: number;
  avgTradesPerActiveDay: number;
  maxTradesInSingleDay: number;
  churnRatio: number;
  totalTurnoverInr: number;
  frictionDragPctOfGross: number;
  frequencyReturnSlope: number;
  frequencyR2: number;
  optimalDailyTradeCap: number;
  overtradingExcessCostInr: number;
  frequencyBuckets: FrequencyBucket[];
  dailyScatter: Array<{ date: string; tradeCount: number; netPnl: number; returnPct: number }>;
}

export interface MarkovStateStats {
  count: number;
  nextWinProb: number;
  nextLossProb: number;
  avgReturnPct: number;
  avgSizeRatio: number;
}

export interface RevengeTradingMetrics {
  baselineWinRate: number;
  postLossWinRate: number;
  postTwoLossWinRate: number;
  medianNotionalInr: number;
  postLossAvgSizeRatio: number;
  medianHoursBetweenTrades: number;
  medianHoursAfterLoss: number;
  timeCompressionRatio: number;
  revengeTradesCount: number;
  revengeTradesNetPnl: number;
  revengeCostInr: number;
  transitionMatrix: {
    afterWin: MarkovStateStats;
    afterLoss: MarkovStateStats;
  };
}

export interface EquityCurvePoint {
  date: string;
  tradeIndex: number;
  cumulativeGrossPnl: number;
  cumulativeNetPnl: number;
  disciplinedCounterfactualPnl: number;
  benchmarkEquivalentPnl: number | null;
  drawdownInr: number;
}

export interface SymbolBreakdown {
  symbol: string;
  tradesCount: number;
  winRate: number;
  grossPnl: number;
  charges: number;
  netPnl: number;
  avgWinHoldDays: number;
  avgLossHoldDays: number;
  revengeCount: number;
  benchmarkReturnPct: number | null;
}

export interface BehavioralAnalysisReport {
  summary: {
    closedTradesCount: number;
    openPositionsCount: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    grossPnl: number;
    totalCharges: number;
    netPnl: number;
    profitFactor: number;
    expectancyPerTrade: number;
    sharpeLikeRatio: number;
    maxDrawdownInr: number;
    maxDrawdownPct: number;
    dateRange: { start: string; end: string };
  };
  disposition: DispositionMetrics;
  prospectTheory: ProspectTheoryMetrics;
  overtrading: OvertradingMetrics;
  revengeTrading: RevengeTradingMetrics;
  counterfactual: {
    disciplinedNetPnl: number;
    behavioralLeakageTotalInr: number;
    dispositionLeakageInr: number;
    revengeLeakageInr: number;
    overtradingLeakageInr: number;
    benchmarkReturnPct: number | null;
    traderWeightedReturnPct: number;
    alphaVsNiftyPct: number | null;
    equityCurve: EquityCurvePoint[];
  };
  symbolBreakdowns: SymbolBreakdown[];
  trades: RoundTripTrade[];
  openPositions: OpenPosition[];
}
