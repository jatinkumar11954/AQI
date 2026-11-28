import { formatDate, formatTime } from '../shared/planner';

const numberFormats = {
  0: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }),
} as const;

/** Formats a numeric reading using Indian grouping or returns an em dash when absent. */
export function formatNumber(value: number | null | undefined, places: 0 | 1 = 0): string {
  return value == null ? '—' : numberFormats[places].format(value);
}

/** Formats a Unix timestamp in seconds as a concise IST date and time string. */
export function formatDateTime(time: number): string {
  return `${formatDate(time)}, ${formatTime(time)} IST`;
}
