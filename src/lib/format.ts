export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dayDiff(ts: number, now: Date): number {
  return Math.round((startOfDay(new Date(ts)) - startOfDay(now)) / 86_400_000);
}

export function hhmm(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatFolderTime(ts: number, now: Date): string {
  const diff = dayDiff(ts, now);
  const time = hhmm(ts);
  if (diff === 0) return `今天 ${time}`;
  if (diff === -1) return `昨天 ${time}`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function formatFileTime(ts: number, now: Date): string {
  const diff = dayDiff(ts, now);
  const time = hhmm(ts);
  if (diff === 0) return `今日 ${time}`;
  if (diff === -1) return `昨日 ${time}`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function formatBytes(size: number): string {
  if (size <= 0) return "0 KB";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function mb(n: number): number {
  return Math.round(n * 1024 * 1024);
}
