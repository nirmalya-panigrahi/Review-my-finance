import { describe, expect, it } from 'vitest';
import { parseBrokerCsv, parseDateAndTime, parseRawCsvRows } from '../csvParser';

describe('csvParser — Blue Pill (Happy Path)', () => {
  it('parses Zerodha Kite tradebook CSV with quoted fields and BOM', () => {
    const csv =
      '\uFEFFsymbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time\n' +
      'RELIANCE,INE002A01018,2025-01-06,NSE,EQ,EQ,buy,false,10,"1,242.50",801,1101,2025-01-06T09:32:14\n' +
      'RELIANCE,INE002A01018,2025-01-09,NSE,EQ,EQ,sell,false,10,"1,268.00",802,1102,2025-01-09T14:20:05\n';

    const res = parseBrokerCsv(csv);
    expect(res.detectedFormat).toBe('zerodha');
    expect(res.needsManualMapping).toBe(false);
    expect(res.executions).toHaveLength(2);
    expect(res.executions[0].symbol).toBe('RELIANCE');
    expect(res.executions[0].price).toBe(1242.5);
    expect(res.executions[1].side).toBe('SELL');
  });

  it('parses Groww DD-MM-YYYY timestamps and filters non-executed orders', () => {
    const csv =
      'Stock Name,Symbol,ISIN,Type,Quantity,Price,Exchange,Order Status,Execution Date and Time\n' +
      'Tata Consultancy,TCS,INE467B01029,BUY,5,3955.00,NSE,Executed,14-02-2025 10:12:00\n' +
      'Tata Consultancy,TCS,INE467B01029,SELL,5,4010.00,NSE,Cancelled,15-02-2025 11:00:00\n' +
      'Tata Consultancy,TCS,INE467B01029,SELL,5,4020.00,NSE,Executed,16-02-2025 14:30:00\n';

    const res = parseBrokerCsv(csv);
    expect(res.detectedFormat).toBe('groww');
    expect(res.executions).toHaveLength(2);
    expect(res.skippedRows).toBe(1);
    expect(res.executions[0].tradeDate).toBe('2025-02-14');
    expect(res.executions[1].tradeDate).toBe('2025-02-16');
  });
});

describe('csvParser — Red Pill (Adversarial & Edge Cases)', () => {
  it('handles empty string and header-only CSV safely', () => {
    expect(parseRawCsvRows('')).toEqual([]);
    const headerOnly = parseBrokerCsv('symbol,side,quantity,price,date\n');
    expect(headerOnly.executions).toHaveLength(0);
    expect(headerOnly.warnings.length).toBeGreaterThan(0);
  });

  it('rejects negative quantities, zero prices, invalid calendar dates, and duplicate IDs', () => {
    const csv =
      'symbol,trade_type,quantity,price,trade_date,order_id\n' +
      'INFY,BUY,-10,1500,2025-01-10,ORD1\n' +
      'INFY,BUY,10,0,2025-01-10,ORD2\n' +
      'INFY,BUY,10,1500,2025-02-30,ORD3\n' +
      'INFY,BUY,10,1500,2025-01-12,ORD4\n' +
      'INFY,BUY,10,1500,2025-01-12,ORD4\n';

    const res = parseBrokerCsv(csv);
    expect(res.executions).toHaveLength(1);
    expect(res.skippedRows).toBe(4);
    expect(res.warnings).toHaveLength(4);
  });

  it('flags needsManualMapping for unrecognized column names and applies override mapping', () => {
    const csv =
      'ScripCol,ActionCol,LotsCol,RateCol,WhenCol\n' +
      'SBIN,BUY,20,760,2025-03-01\n' +
      'SBIN,SELL,20,780,2025-03-04\n';

    const initial = parseBrokerCsv(csv);
    expect(initial.needsManualMapping).toBe(true);
    expect(initial.executions).toHaveLength(0);

    const mapped = parseBrokerCsv(csv, {
      symbol: 'ScripCol',
      side: 'ActionCol',
      quantity: 'LotsCol',
      price: 'RateCol',
      tradeDate: 'WhenCol',
    });
    expect(mapped.needsManualMapping).toBe(false);
    expect(mapped.executions).toHaveLength(2);
    expect(mapped.executions[0].symbol).toBe('SBIN');
  });

  it('rejects malformed dates cleanly in parseDateAndTime', () => {
    expect(parseDateAndTime('not-a-date')).toBeNull();
    expect(parseDateAndTime('2025-13-01')).toBeNull();
    expect(parseDateAndTime('2025-02-29')).toBeNull(); // 2025 is not a leap year
    expect(parseDateAndTime('2025-01-15 25:00:00')).toBeNull();
  });
});
