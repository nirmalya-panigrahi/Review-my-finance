import type {
  BrokerFormat,
  ColumnMapping,
  CsvParseResult,
  MarketSegment,
  ParseWarning,
  RawExecution,
  TradeSide,
} from './types';

/**
 * RFC-4180 compliant CSV parser handling quoted fields, escaped quotes, BOM, and CRLF/LF.
 */
export function parseRawCsvRows(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  if (!cleanText.trim()) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function detectBrokerFormat(headers: string[]): BrokerFormat {
  const norm = new Set(headers.map(normalizeHeaderKey));
  if (
    norm.has('tradetype') &&
    norm.has('tradedate') &&
    (norm.has('orderexecutiontime') || norm.has('tradeid'))
  ) {
    return 'zerodha';
  }
  if (
    (norm.has('stockname') || norm.has('symbol')) &&
    (norm.has('executiondateandtime') || norm.has('orderstatus') || norm.has('status')) &&
    norm.has('type')
  ) {
    return 'groww';
  }
  return 'generic';
}

function findHeaderMatch(headers: string[], candidates: string[]): string | undefined {
  const normalizedMap = new Map<string, string>();
  for (const h of headers) {
    normalizedMap.set(normalizeHeaderKey(h), h);
  }
  for (const candidate of candidates) {
    const found = normalizedMap.get(candidate);
    if (found) return found;
  }
  return undefined;
}

export function inferColumnMapping(headers: string[]): Partial<ColumnMapping> {
  return {
    symbol: findHeaderMatch(headers, [
      'symbol',
      'tradingsymbol',
      'stockname',
      'scrip',
      'ticker',
      'instrument',
      'stock',
    ]),
    side: findHeaderMatch(headers, [
      'tradetype',
      'type',
      'side',
      'action',
      'buysell',
      'transactiontype',
    ]),
    quantity: findHeaderMatch(headers, ['quantity', 'qty', 'filledqty', 'shares', 'units']),
    price: findHeaderMatch(headers, [
      'price',
      'tradeprice',
      'averageprice',
      'avgprice',
      'executionprice',
      'rate',
    ]),
    tradeDate: findHeaderMatch(headers, [
      'tradedate',
      'orderexecutiontime',
      'executiondateandtime',
      'date',
      'timestamp',
      'datetime',
    ]),
    executionTime: findHeaderMatch(headers, [
      'orderexecutiontime',
      'executiondateandtime',
      'tradetime',
      'time',
      'executiontime',
    ]),
    exchange: findHeaderMatch(headers, ['exchange', 'exch']),
    segment: findHeaderMatch(headers, ['segment', 'product', 'series']),
    orderId: findHeaderMatch(headers, ['orderid', 'tradeid', 'id', 'referenceno']),
    status: findHeaderMatch(headers, ['status', 'orderstatus']),
  };
}

/**
 * Parses common Indian and ISO date/time strings into YYYY-MM-DD and HH:mm:ss.
 */
export function parseDateAndTime(
  rawDate: string,
  rawTime?: string
): { tradeDate: string; executionTime: string; timestampMs: number } | null {
  const combined = rawTime && rawTime !== rawDate ? `${rawDate} ${rawTime}`.trim() : rawDate.trim();
  if (!combined) return null;

  // Extract time if present
  const timeMatch = combined.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  let hours = 9;
  let minutes = 15;
  let seconds = 0;

  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    seconds = Number(timeMatch[3] ?? '0');
    const meridiem = timeMatch[4]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const executionTime = `${hh}:${mm}:${ss}`;

  const datePart = combined.split(/[T\s]/)[0].trim();

  let year: number;
  let month: number;
  let day: number;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  } else {
    const parsed = new Date(combined);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth() + 1;
    day = parsed.getUTCDate();
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) {
    return null;
  }

  const checkDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }

  const tradeDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Treat Indian IST (+05:30) cleanly into epoch ms for chronological ordering
  const timestampMs = Date.parse(`${tradeDate}T${executionTime}+05:30`);
  if (Number.isNaN(timestampMs)) return null;

  return { tradeDate, executionTime, timestampMs };
}

function normalizeSide(raw: string): TradeSide | null {
  const clean = raw.trim().toUpperCase();
  if (clean === 'BUY' || clean === 'B' || clean === 'BOT' || clean === 'LONG') return 'BUY';
  if (clean === 'SELL' || clean === 'S' || clean === 'SLD' || clean === 'SHORT') return 'SELL';
  return null;
}

function normalizeSymbol(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+(LTD|LIMITED)\.?$/i, '')
    .replace(/-(EQ|BE|BZ|SM|ST)$/i, '')
    .replace(/[^A-Z0-9.\-^&]/g, '');
}

function parseNumeric(raw: string): number {
  const cleaned = raw.replace(/[₹,\s]/g, '');
  const val = Number(cleaned);
  return Number.isFinite(val) ? val : NaN;
}

function normalizeSegment(raw?: string): MarketSegment {
  const s = (raw ?? '').trim().toUpperCase();
  if (s === 'FO' || s === 'NFO' || s === 'F&O') return 'FO';
  if (s === 'MIS' || s === 'INTRADAY') return 'INTRADAY';
  return 'EQ';
}

export function parseBrokerCsv(
  csvText: string,
  overrideMapping?: ColumnMapping
): CsvParseResult {
  const rows = parseRawCsvRows(csvText);
  if (rows.length < 2) {
    return {
      executions: [],
      detectedFormat: 'generic',
      headers: rows[0] ?? [],
      rawPreviewRows: [],
      totalRows: 0,
      skippedRows: 0,
      warnings: [{ rowNumber: 1, reason: 'CSV must contain a header row and at least one trade row.' }],
      needsManualMapping: false,
      inferredMapping: {},
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const detectedFormat = detectBrokerFormat(headers);
  const inferred = inferColumnMapping(headers);
  const mapping: Partial<ColumnMapping> = overrideMapping ?? inferred;

  const hasRequiredColumns = Boolean(
    mapping.symbol && mapping.side && mapping.quantity && mapping.price && mapping.tradeDate
  );

  if (!hasRequiredColumns) {
    return {
      executions: [],
      detectedFormat,
      headers,
      rawPreviewRows: dataRows.slice(0, 5),
      totalRows: dataRows.length,
      skippedRows: dataRows.length,
      warnings: [
        {
          rowNumber: 1,
          reason: 'Could not auto-detect all required columns (Symbol, Side, Quantity, Price, Date). Please map columns manually.',
        },
      ],
      needsManualMapping: true,
      inferredMapping: inferred,
    };
  }

  const idx = {
    symbol: headers.indexOf(mapping.symbol!),
    side: headers.indexOf(mapping.side!),
    quantity: headers.indexOf(mapping.quantity!),
    price: headers.indexOf(mapping.price!),
    tradeDate: headers.indexOf(mapping.tradeDate!),
    executionTime: mapping.executionTime ? headers.indexOf(mapping.executionTime) : -1,
    exchange: mapping.exchange ? headers.indexOf(mapping.exchange) : -1,
    segment: mapping.segment ? headers.indexOf(mapping.segment) : -1,
    orderId: mapping.orderId ? headers.indexOf(mapping.orderId) : -1,
    status: mapping.status ? headers.indexOf(mapping.status) : -1,
  };

  const executions: RawExecution[] = [];
  const warnings: ParseWarning[] = [];
  const seenTradeIds = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2;

    if (idx.status >= 0) {
      const status = (row[idx.status] ?? '').trim().toUpperCase();
      if (status && !['EXECUTED', 'FILLED', 'COMPLETE', 'COMPLETED', 'TRADED'].includes(status)) {
        warnings.push({ rowNumber: rowNum, reason: `Skipped non-executed order status "${status}".` });
        continue;
      }
    }

    const rawSymbol = row[idx.symbol] ?? '';
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) {
      warnings.push({ rowNumber: rowNum, reason: 'Missing or invalid ticker symbol.' });
      continue;
    }

    const side = normalizeSide(row[idx.side] ?? '');
    if (!side) {
      warnings.push({ rowNumber: rowNum, reason: `Unrecognized trade side "${row[idx.side] ?? ''}".` });
      continue;
    }

    const quantity = parseNumeric(row[idx.quantity] ?? '');
    const price = parseNumeric(row[idx.price] ?? '');
    if (!(quantity > 0) || !(price > 0)) {
      warnings.push({ rowNumber: rowNum, reason: 'Quantity and price must be positive numbers.' });
      continue;
    }

    const parsedDt = parseDateAndTime(
      row[idx.tradeDate] ?? '',
      idx.executionTime >= 0 ? row[idx.executionTime] : undefined
    );
    if (!parsedDt) {
      warnings.push({ rowNumber: rowNum, reason: `Invalid trade date "${row[idx.tradeDate] ?? ''}".` });
      continue;
    }

    const rawOrderId = idx.orderId >= 0 && row[idx.orderId] ? row[idx.orderId].trim() : `ROW-${rowNum}`;
    const dedupeKey = `${rawOrderId}|${symbol}|${side}|${quantity}|${price}|${parsedDt.timestampMs}`;
    if (idx.orderId >= 0 && row[idx.orderId] && seenTradeIds.has(dedupeKey)) {
      warnings.push({ rowNumber: rowNum, reason: `Duplicate execution ignored (${rawOrderId}).` });
      continue;
    }
    seenTradeIds.add(dedupeKey);

    const exchange = idx.exchange >= 0 && row[idx.exchange] ? row[idx.exchange].trim().toUpperCase() : 'NSE';
    const segment = normalizeSegment(idx.segment >= 0 ? row[idx.segment] : undefined);

    executions.push({
      id: `${symbol}-${rowNum}-${rawOrderId}`,
      symbol,
      exchange,
      tradeDate: parsedDt.tradeDate,
      executionTime: parsedDt.executionTime,
      timestampMs: parsedDt.timestampMs,
      side,
      quantity,
      price,
      tradeValue: Number((quantity * price).toFixed(2)),
      orderId: rawOrderId,
      segment,
    });
  }

  executions.sort((a, b) => a.timestampMs - b.timestampMs);

  return {
    executions,
    detectedFormat,
    headers,
    rawPreviewRows: dataRows.slice(0, 5),
    totalRows: dataRows.length,
    skippedRows: dataRows.length - executions.length,
    warnings,
    needsManualMapping: false,
    inferredMapping: inferred,
  };
}
