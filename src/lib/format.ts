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

export function formatTodoWhen(ts: number | null, now: Date): string {
  if (ts == null) return "";
  const diff = dayDiff(ts, now);
  const time = hhmm(ts);
  if (diff === 0) return time;
  if (diff === 1) return `明天 ${time}`;
  if (diff === -1) return `昨天 ${time}`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export function formatGroupLabel(ts: number, now: Date): string {
  const date = new Date(ts);
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  const diff = dayDiff(ts, now);
  if (diff === 0) return `今天 · ${md}`;
  if (diff === 1) return `明天 · ${md}`;
  if (diff === -1) return `昨天 · ${md}`;
  return md;
}

export function formatSuggestionWhen(ts: number): string {
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()} ${hhmm(ts)}`;
}

export function formatBytes(size: number): string {
  if (size <= 0) return "0 KB";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatInputDateTime(ts: number): string {
  const date = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function parseInputDateTime(value: string): number | null {
  const match = value.trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() !== Number(match[2]) - 1) return null;
  return date.getTime();
}

export function mb(n: number): number {
  return Math.round(n * 1024 * 1024);
}
