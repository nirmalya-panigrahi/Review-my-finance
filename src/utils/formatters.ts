export function formatInr(value: number, showSign = false): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: abs >= 1000 ? 0 : 2,
  }).format(abs);

  if (value < 0) return `-${formatted}`;
  if (showSign && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatPct(value: number, showSign = false, digits = 1): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value < 0) return `-${abs}%`;
  if (showSign && value > 0) return `+${abs}%`;
  return `${abs}%`;
}

export function formatDurationDays(days: number): string {
  if (days < 1) {
    const hours = Math.max(0.1, days * 24);
    return `${hours.toFixed(1)}h`;
  }
  return `${days.toFixed(1)}d`;
}

export function formatPValue(p: number): string {
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}
