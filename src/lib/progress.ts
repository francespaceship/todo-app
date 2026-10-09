export function progress(statuses: string[]): number {
  if (statuses.length === 0) return 0;
  const done = statuses.filter((s) => s === "done").length;
  return Math.round((done / statuses.length) * 100);
}

export function goalProgress(planProgresses: number[]): number {
  if (planProgresses.length === 0) return 0;
  const sum = planProgresses.reduce((a, b) => a + b, 0);
  return Math.round(sum / planProgresses.length);
}
