import { useState } from 'react';
import type { ColumnMapping } from '../engine/types';

interface ColumnMapperProps {
  headers: string[];
  rawPreviewRows: string[][];
  initialMapping: Partial<ColumnMapping>;
  onApplyMapping: (mapping: ColumnMapping) => void;
}

export function ColumnMapper({
  headers,
  rawPreviewRows,
  initialMapping,
  onApplyMapping,
}: ColumnMapperProps) {
  const [symbol, setSymbol] = useState(initialMapping.symbol ?? headers[0] ?? '');
  const [side, setSide] = useState(initialMapping.side ?? headers[1] ?? '');
  const [quantity, setQuantity] = useState(initialMapping.quantity ?? headers[2] ?? '');
  const [price, setPrice] = useState(initialMapping.price ?? headers[3] ?? '');
  const [tradeDate, setTradeDate] = useState(initialMapping.tradeDate ?? headers[4] ?? '');
  const [executionTime, setExecutionTime] = useState(initialMapping.executionTime ?? '');

  const isValid = Boolean(symbol && side && quantity && price && tradeDate);

  return (
    <div className="border border-amber-300 bg-amber-50/50 p-5 rounded-lg">
      <h3 className="text-base font-semibold text-slate-900">Map CSV Columns</h3>
      <p className="mt-1 text-sm text-slate-600">
        Your CSV uses custom column headers. Assign the required fields below to run local FIFO matching.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: 'Ticker Symbol *', value: symbol, onChange: setSymbol },
          { label: 'Buy / Sell Side *', value: side, onChange: setSide },
          { label: 'Quantity *', value: quantity, onChange: setQuantity },
          { label: 'Execution Price *', value: price, onChange: setPrice },
          { label: 'Trade Date *', value: tradeDate, onChange: setTradeDate },
        ].map((field) => (
          <label key={field.label} className="block text-xs font-medium text-slate-700">
            {field.label}
            <select
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            >
              <option value="">Select column...</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="block text-xs font-medium text-slate-700">
          Execution Time (optional)
          <select
            value={executionTime}
            onChange={(e) => setExecutionTime(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
          >
            <option value="">None / Same as Date</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rawPreviewRows.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-slate-200 bg-white rounded-md">
          <table className="min-w-full text-left text-xs font-mono">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rawPreviewRows.slice(0, 3).map((row, idx) => (
                <tr key={idx}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                      {row[cIdx] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!isValid}
          onClick={() =>
            onApplyMapping({
              symbol,
              side,
              quantity,
              price,
              tradeDate,
              executionTime: executionTime || undefined,
            })
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Apply Mapping &amp; Analyze
        </button>
      </div>
    </div>
  );
}
