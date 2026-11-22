import { Download, FileSpreadsheet, ShieldCheck, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { SAMPLE_DATASETS } from '../engine/sampleDatasets';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadCsv: (csvText: string, fileName: string) => Promise<void>;
  onSelectSample: (sampleId: 'zerodha-swing' | 'groww-active') => Promise<void>;
}

export function UploadModal({
  isOpen,
  onClose,
  onUploadCsv,
  onSelectSample,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setLocalError(null);
    if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
      setLocalError('Please select a valid .csv broker tradebook file.');
      return;
    }
    setIsProcessing(true);
    try {
      const text = await file.text();
      await onUploadCsv(text, file.name);
      onClose();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to read CSV file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSample = (sampleId: 'zerodha-swing' | 'groww-active') => {
    const sample = SAMPLE_DATASETS.find((s) => s.id === sampleId);
    if (!sample) return;
    const blob = new Blob([sample.csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${sample.id}-sample.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="upload-modal-title" className="font-display text-lg font-semibold text-slate-900">
            Load Broker Trade History
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload dialog"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Privacy Notice */}
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong className="font-semibold text-slate-900">Privacy-first local computation:</strong>{' '}
              Your CSV executions, quantities, and P&amp;L are parsed and modeled strictly inside browser memory.
              Only unique stock tickers and date bounds are queried to retrieve historical daily market prices from Yahoo Finance or Alpha Vantage.
            </p>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-teal-700 bg-teal-50/40'
                : 'border-slate-300 bg-slate-50/50 hover:border-slate-400'
            }`}
          >
            <Upload className="h-7 w-7 text-slate-500" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              Drop your Zerodha Kite, Groww, or equity broker CSV here
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Supports Zerodha Console tradebook, Groww order history, or custom CSVs with column mapping
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              <span>{isProcessing ? 'Parsing CSV...' : 'Choose CSV File'}</span>
            </button>
          </div>

          {localError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
              {localError}
            </div>
          )}

          {/* Sample Tradebooks */}
          <div className="border-t border-slate-200 pt-5">
            <h3 className="text-xs font-semibold text-slate-700">
              Or load a verified Indian retail sample tradebook
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SAMPLE_DATASETS.map((sample) => (
                <div
                  key={sample.id}
                  className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{sample.label}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{sample.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsProcessing(true);
                        await onSelectSample(sample.id);
                        setIsProcessing(false);
                        onClose();
                      }}
                      className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                    >
                      Load Sample
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSample(sample.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Download CSV</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
