export function msToClock(ms: number): string {
  return new Date(ms).toISOString();
}
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
