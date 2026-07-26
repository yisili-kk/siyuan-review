export function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function isDue(nextReviewAt: string | undefined, dateKey: string): boolean {
  return Boolean(nextReviewAt && nextReviewAt <= dateKey);
}

export function secondsBetween(startIso: string | undefined, endIso: string): number | undefined {
  if (!startIso) {
    return undefined;
  }

  const diff = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(diff) || diff < 0) {
    return undefined;
  }

  return Math.round(diff / 1000);
}
