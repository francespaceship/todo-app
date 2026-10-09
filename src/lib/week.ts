const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return fromUtc(toUtc(date)) === date;
}

export function weekEnd(start: string): string {
  return fromUtc(toUtc(start) + 6 * DAY_MS);
}

export function isDateInWeek(date: string, start: string): boolean {
  const t = toUtc(date);
  return t >= toUtc(start) && t <= toUtc(start) + 6 * DAY_MS;
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function isMonday(date: string): boolean {
  return new Date(toUtc(date)).getUTCDay() === 1;
}

export function mondayOf(date: string): string {
  const dow = new Date(toUtc(date)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}
