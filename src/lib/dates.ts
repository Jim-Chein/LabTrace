import * as chrono from "chrono-node";

export interface TimeMention {
  text: string;
  start: number;
  end: number;
  dueAt: number;
  content: string;
  fingerprint: string;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const DATE_RE =
  /(?:(\d{4})\s*[-\/.年]\s*)?(\d{1,2})\s*[/\月.\-]\s*(\d{1,2})\s*日?\s*(?:(上午|下午|晚上|中午)\s*)?(?:([0-2]?\d)\s*[:：点时]\s*([0-5]\d)?)?/g;

const REL_RE =
  /(今天|明天|后天|昨天|今晚|明早|下周[天日一二三四五六]|本周[天日一二三四五六])\s*(上午|下午|晚上|中午)?\s*(?:([0-2]?\d)\s*[:：点时]\s*([0-5]\d)?(?:\s*分)?)?/g;

function fingerprint(dueAt: number, content: string): string {
  return `${dueAt}|${content.trim()}`;
}

function stamp(ymd: Ymd, hour: number, minute: number): number {
  return new Date(ymd.y, ymd.m - 1, ymd.d, hour, minute, 0, 0).getTime();
}

function ymdFromDate(date: Date): Ymd {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function shiftDays(now: Date, days: number): Ymd {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return ymdFromDate(date);
}

function contentFrom(rest: string): string {
  const cleaned = rest.trim().replace(/^[，,：:\s]+/, "");
  const head = cleaned.split(/[，,。；;]/)[0]?.trim() ?? "";
  const base = head || cleaned || "实验安排";
  if (/\d+(?:\.\d+)?\s*mM/i.test(base) && !base.includes("加药")) return `${base} 加药`;
  return base;
}

function applyMeridiem(hour: number, meridiem: string | undefined): number | null {
  if (hour > 23 || hour < 0) return null;
  if (!meridiem || meridiem === "上午") return hour;
  if (meridiem === "中午") return hour <= 10 ? hour + 12 : hour;
  if ((meridiem === "下午" || meridiem === "晚上") && hour < 12) return hour + 12;
  return hour;
}

function mondayIndex(ch: string): number {
  if (ch === "日" || ch === "天") return 6;
  return "一二三四五六".indexOf(ch);
}

function weekDate(now: Date, token: string): Ymd | null {
  const which = token.startsWith("下周") ? "next" : token.startsWith("本周") ? "this" : null;
  if (!which) return null;
  const index = mondayIndex(token.slice(2));
  if (index < 0) return null;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayBased = (base.getDay() + 6) % 7;
  const day = new Date(base);
  day.setDate(base.getDate() - mondayBased + (which === "next" ? 7 : 0) + index);
  return ymdFromDate(day);
}

function mention(start: number, end: number, matched: string, dueAt: number, rest: string): TimeMention {
  const content = contentFrom(rest);
  return { text: matched, start, end, dueAt, content, fingerprint: fingerprint(dueAt, content) };
}

interface LineHit {
  mentions: TimeMention[];
  context: Ymd | null;
}

function scanLine(line: string, now: Date, context: Ymd | null): LineHit {
  const found: { start: number; end: number; ymd: Ymd; dueAt: number | null; text: string }[] = [];

  for (const match of line.matchAll(REL_RE)) {
    const token = match[1];
    const meridiem = match[2];
    const hourRaw = match[3];
    const minuteRaw = match[4];
    const index = match.index ?? 0;
    let ymd: Ymd | null = null;
    if (token === "今天" || token === "今晚") ymd = shiftDays(now, 0);
    else if (token === "明天" || token === "明早") ymd = shiftDays(now, 1);
    else if (token === "后天") ymd = shiftDays(now, 2);
    else if (token === "昨天") ymd = shiftDays(now, -1);
    else ymd = weekDate(now, token);
    if (!ymd) continue;

    let hour: number | null = null;
    let minute = 0;
    if (hourRaw != null) {
      hour = applyMeridiem(Number(hourRaw), meridiem);
      minute = minuteRaw != null ? Number(minuteRaw) : 0;
    } else if (token === "今晚") hour = 20;
    else if (token === "明早") hour = 8;
    if (hour == null || minute > 59) {
      found.push({ start: index, end: index + match[0].length, ymd, dueAt: null, text: match[0] });
      continue;
    }
    found.push({
      start: index,
      end: index + match[0].length,
      ymd,
      dueAt: stamp(ymd, hour, minute),
      text: match[0],
    });
  }

  for (const match of line.matchAll(DATE_RE)) {
    const index = match.index ?? 0;
    if (found.some((hit) => index < hit.end && index + match[0].length > hit.start)) continue;
    const year = match[1] ? Number(match[1]) : now.getFullYear();
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const ymd = { y: year, m: month, d: day };
    const probe = new Date(year, month - 1, day);
    if (probe.getMonth() !== month - 1 || probe.getDate() !== day) continue;
    let dueAt: number | null = null;
    if (match[5] != null) {
      const hour = applyMeridiem(Number(match[5]), match[4]);
      const minute = match[6] != null ? Number(match[6]) : 0;
      if (hour != null && minute <= 59) dueAt = stamp(ymd, hour, minute);
    }
    const text = match[0].trimEnd();
    found.push({ start: index, end: index + text.length, ymd, dueAt, text });
  }

  found.sort((a, b) => a.start - b.start);
  const mentions: TimeMention[] = [];
  let nextContext = context;
  for (const hit of found) {
    nextContext = hit.ymd;
    if (hit.dueAt == null) continue;
    mentions.push(mention(hit.start, hit.end, hit.text, hit.dueAt, line.slice(hit.end)));
  }

  if (found.length === 0 && nextContext) {
    const bare = /^\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s+(\S.*)$/.exec(line);
    if (bare) {
      const hour = Number(bare[1]);
      const minute = Number(bare[2]);
      const start = bare[0].indexOf(bare[1]);
      const end = start + bare[1].length + (bare[0].slice(start).match(/^\d+\s*[:：]\s*\d+/)?.[0].length ?? 0);
      mentions.push(mention(start, end, line.slice(start, end), stamp(nextContext, hour, minute), bare[3]));
    }
  }

  return { mentions, context: nextContext };
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function fromChrono(text: string, now: Date): TimeMention[] {
  const zh = chrono.zh?.hans ?? chrono.zh;
  if (!zh?.parse) return [];
  const results = zh.parse(text, now, { forwardDate: false });
  const mentions: TimeMention[] = [];
  for (const result of results) {
    const due = result.start.date();
    const dueAt = due.getTime();
    const start = result.index;
    const end = start + result.text.length;
    const lineEnd = text.indexOf("\n", end);
    const line = text.slice(start, lineEnd === -1 ? text.length : lineEnd);
    const rest = line.slice(result.text.length);
    mentions.push(mention(start, end, result.text, dueAt, rest));
  }
  return mentions;
}

/** Future times mentioned in lab notes. `now` is injectable for tests. */
export function detectFutureTimes(text: string, now: Date): TimeMention[] {
  if (!text?.trim()) return [];
  const mentions: TimeMention[] = [];
  let offset = 0;
  let context: Ymd | null = null;
  for (const line of text.split("\n")) {
    const hit = scanLine(line, now, context);
    for (const item of hit.mentions) {
      mentions.push({ ...item, start: item.start + offset, end: item.end + offset });
    }
    context = hit.context;
    offset += line.length + 1;
  }

  for (const extra of fromChrono(text, now)) {
    if (mentions.some((item) => rangesOverlap(item, extra))) continue;
    mentions.push(extra);
  }

  return mentions
    .filter((item) => item.dueAt > now.getTime())
    .sort((a, b) => a.dueAt - b.dueAt || a.start - b.start);
}

export function upcomingMentions(text: string, now: Date, ignored: ReadonlySet<string>): TimeMention[] {
  return detectFutureTimes(text, now).filter((item) => !ignored.has(item.fingerprint));
}
