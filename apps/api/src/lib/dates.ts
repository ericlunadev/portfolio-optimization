const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_YEARS = 5;

export function todayDateOnly(): string {
  return new Date().toISOString().split("T")[0];
}

export function dateOnly(date: Date | string | number): string {
  return new Date(date).toISOString().split("T")[0];
}

export function defaultLookbackPeriod(): { period1: string; period2: string } {
  const period2 = todayDateOnly();
  const period1 = new Date(Date.now() - DEFAULT_LOOKBACK_YEARS * 365 * MS_PER_DAY)
    .toISOString()
    .split("T")[0];
  return { period1, period2 };
}

export function toISOStringOrNow(date: Date | null | undefined): string {
  return (date ?? new Date()).toISOString();
}
