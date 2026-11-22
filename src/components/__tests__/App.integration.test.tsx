import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';

describe('ArthaMetric Integration Flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        provider: 'yahoo-finance',
        series: {
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
          RELIANCE: {
            symbol: 'RELIANCE',
            yahooSymbol: 'RELIANCE.NS',
            currency: 'INR',
            exchangeName: 'NSE',
            source: 'yahoo-finance',
            bars: [
              { date: '2025-01-06', open: 1240, high: 1250, low: 1230, close: 1242, adjClose: 1242 },
              { date: '2025-05-05', open: 1380, high: 1400, low: 1370, close: 1390, adjClose: 1390 },
            ],
          },
        },
      }),
    } as Response);
  });

  it('loads default Zerodha sample, navigates across all views, and filters trade ledger', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Behavior vs\. Actual Returns Attribution/i)).toBeInTheDocument();
    });

    // Switch to Psychometrics tab
    await user.click(screen.getByRole('button', { name: 'Psychometrics' }));
    expect(screen.getByText(/Disposition Effect — Odean \(1998\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Post-Loss Markov Transition/i)).toBeInTheDocument();

    // Switch to Market Context tab
    await user.click(screen.getByRole('button', { name: 'Market Context' }));
    expect(screen.getByText(/Nifty 50 \(\^NSEI\) Return/i)).toBeInTheDocument();

    // Switch to Trade Ledger tab and filter by ticker
    await user.click(screen.getByRole('button', { name: 'Trade Ledger' }));
    const searchInput = screen.getByLabelText('Filter trades by ticker');
    await user.type(searchInput, 'TATAMOTORS');
    expect(screen.getAllByText('TATAMOTORS').length).toBeGreaterThan(0);

    // Switch to Methodology tab
    await user.click(screen.getByRole('button', { name: 'Methodology' }));
    expect(screen.getByText(/Chronological FIFO Lot Matching/i)).toBeInTheDocument();
  });

  it('handles sample switching, manual column mapping for custom CSV, and clear/empty state', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Behavior vs\. Actual Returns Attribution/i)).toBeInTheDocument();
    });

    // Switch to Groww sample
    await user.click(screen.getByRole('button', { name: 'Groww Sample' }));
    await waitFor(() => {
      expect(screen.getByText(/Groww Orders & Trades Export/i)).toBeInTheDocument();
    });

    // Open Upload modal and upload an unrecognized-header CSV (Red Pill manual mapping)
    await user.click(screen.getByRole('button', { name: /Upload CSV/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const customCsv =
      'TickerCode,OrderSide,Units,Rate,ExecDate\n' +
      'INFY,BUY,10,1800,2025-02-01\n' +
      'INFY,SELL,10,1900,2025-02-05\n';
    const file = new File([customCsv], 'custom-broker.csv', { type: 'text/csv' });
    // Ensure File.prototype.text works in jsdom
    Object.defineProperty(file, 'text', {
      value: async () => customCsv,
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('Map CSV Columns')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Apply Mapping & Analyze/i }));
    await waitFor(() => {
      expect(screen.getByText(/Behavior vs\. Actual Returns Attribution/i)).toBeInTheDocument();
    });

    // Clear Data -> Empty state
    await user.click(screen.getByRole('button', { name: 'Clear Data' }));
    expect(screen.getByText(/Upload Your Broker CSV for Local Psychometric Analysis/i)).toBeInTheDocument();
  });
});
