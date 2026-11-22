export function MethodologyView() {
  const models = [
    {
      title: '01. Chronological FIFO Lot Matching & Statutory Friction',
      formula: 'Net P&L = (P_exit − P_entry) × Q − (STT + Exchange Tx + SEBI + Stamp Duty + 18% GST)',
      body: 'Raw executions are sorted chronologically by IST timestamp and matched per ticker using strict First-In, First-Out (FIFO) queues for both delivery long and intraday short positions. Indian equity statutory charges are computed dynamically using NSE delivery (0.1% STT both sides, 0.015% buy stamp) vs intraday (0.025% sell STT, capped ₹20 brokerage) rules.',
    },
    {
      title: '02. Disposition Effect — Odean (1998) PGR / PLR & Z-Test',
      formula: 'PGR = RG / (RG + PG),   PLR = RL / (RL + PL),   Z = (PGR − PLR) / SE_pooled',
      body: 'On every realized exit date, the engine inspects all concurrent open positions and marks them against real historical daily closing prices retrieved from Yahoo Finance or Alpha Vantage to classify Paper Gains (PG) vs Paper Losses (PL). A two-proportion Z-test verifies whether your propensity to realize winners significantly exceeds your propensity to realize losers.',
    },
    {
      title: '03. Kahneman–Tversky Prospect Theory Value Function',
      formula: 'v(x) = x^α  (x ≥ 0),    v(x) = −λ(−x)^β  (x < 0)',
      body: 'Sensitivity exponents α and β are calibrated from the interquartile dispersion of realized gain and loss returns. Implied loss aversion λ measures the ratio of tolerated drawdown magnitude relative to captured winner magnitude, benchmarked against a rational symmetric risk boundary (λ = 1.00).',
    },
    {
      title: '04. Post-Loss Revenge Trading (2-State Markov Chain)',
      formula: 'P(Win_t | Loss_{t−1})  vs  P(Win_t | Win_{t−1})   &   SizeRatio = Notional_t / MedianNotional',
      body: 'Transitions are conditioned on the preceding closed trade outcome. Trades entered within 24 hours of a realized loss with notional sizing ≥ 1.25× median (or rapid re-entries within 6 hours after ≥ 2 consecutive losses) are isolated as revenge candidates to quantify conditional win-rate decay and time compression.',
    },
    {
      title: '05. Overtrading OLS Regression & Disciplined Counterfactual',
      formula: 'ReturnPct_day = β₀ + β₁(Trades_day) + ε,   Counterfactual = Σ Trim(RevengeSize, TailHold, TiltCap)',
      body: 'Daily sessions are regressed via Ordinary Least Squares to test whether incremental trade frequency erodes net expectancy. The Disciplined Counterfactual curve replays your identical trade sequence while normalizing revenge-escalated sizing back to 1.0× median, capping losing holds at 1.5× median winner duration, and stopping sessions at the optimal daily trade cap.',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Mathematical Modeling &amp; Privacy Architecture
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Purely deterministic econometric models — zero black-box AI, zero server-side trade storage.
        </p>
      </div>

      <div className="space-y-4">
        {models.map((m) => (
          <section key={m.title} className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">{m.title}</h2>
            <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-800">
              {m.formula}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{m.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
