import type { Attachment } from "../types";

export type LocalPathKind = "posix" | "windows" | "unc";

export type PathCheck = { ok: true; kind: LocalPathKind; path: string } | { ok: false; reason: string };

const MAX_PATH = 32_768;

/** Accept only absolute local filesystem paths. Reject URLs, relative paths, and control characters. */
export function inspectLocalPath(input: string): PathCheck {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_PATH) {
    return { ok: false, reason: "invalid path" };
  }
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return { ok: false, reason: "invalid path" };
  }
  if (input.includes("://") || hasScheme(input)) return { ok: false, reason: "invalid path" };
  if (isWindowsDrive(input)) return { ok: true, kind: "windows", path: input };
  if (isUnc(input)) return { ok: true, kind: "unc", path: input };
  if (isPosixAbsolute(input)) return { ok: true, kind: "posix", path: input };
  return { ok: false, reason: "invalid path" };
}

function hasScheme(input: string): boolean {
  const index = input.indexOf(":");
  if (index < 0) return false;
  if (index === 1 && /[A-Za-z]/.test(input[0])) {
    const next = input.charCodeAt(2);
    return next !== 0x5c && next !== 0x2f;
  }
  const prefix = input.slice(0, index);
  return /^[A-Za-z][A-Za-z0-9+.-]*$/.test(prefix);
}

function isWindowsDrive(input: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(input);
}

function isUnc(input: string): boolean {
  if (!input.startsWith("\\\\")) return false;
  const rest = input.slice(2);
  if (!rest || rest.startsWith("\\")) return false;
  if (rest.startsWith("?\\")) {
    const extended = rest.slice(2);
    return isWindowsDrive(extended) || extended.startsWith("UNC\\");
  }
  const parts = rest.split("\\").filter((part) => part.length > 0);
  if (parts.length < 2) return false;
  return parts[0] !== "." && parts[0] !== "?";
}

function isPosixAbsolute(input: string): boolean {
  return input.startsWith("/") && !input.startsWith("//");
}

export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

export function revealLabel(path: string): string {
  const checked = inspectLocalPath(path);
  if (checked.ok && (checked.kind === "windows" || checked.kind === "unc")) return "在资源管理器中显示";
  const agent = typeof navigator === "undefined" ? "" : `${navigator.platform} ${navigator.userAgent}`;
  if (/Mac/i.test(agent)) return "在访达中显示";
  return "在文件管理器中显示";
}

/** Keep an imported copy's stored name and never invent a source path. */
export function normalizeAttachment(raw: Attachment): Attachment {
  const storedName = typeof raw.storedName === "string" && raw.storedName.length > 0 ? raw.storedName : undefined;
  const sourcePath = typeof raw.sourcePath === "string" && raw.sourcePath.length > 0 ? raw.sourcePath : undefined;
  return {
    id: raw.id,
    experimentId: raw.experimentId,
    blockId: raw.blockId,
    filename: raw.filename,
    ...(storedName ? { storedName } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    size: raw.size,
    updatedAt: raw.updatedAt,
  };
}

export function fileReference(input: {
  id: string;
  experimentId: string;
  blockId: string;
  sourcePath: string;
  size: number;
  updatedAt: number;
}): Attachment {
  const checked = inspectLocalPath(input.sourcePath);
  if (!checked.ok) throw new Error(checked.reason);
  return {
    id: input.id,
    experimentId: input.experimentId,
    blockId: input.blockId,
    filename: fileNameOf(checked.path),
    sourcePath: checked.path,
    size: input.size,
    updatedAt: input.updatedAt,
  };
}

/** Point a row at an original file. The imported copy, if any, stays in place. */
export function relinkAttachment(file: Attachment, sourcePath: string, observed: { size: number; updatedAt: number }): Attachment {
  const checked = inspectLocalPath(sourcePath);
  if (!checked.ok) throw new Error(checked.reason);
  return {
    ...file,
    sourcePath: checked.path,
    filename: fileNameOf(checked.path),
    size: observed.size,
    updatedAt: observed.updatedAt,
  };
}

/** Names of bytes this app copied. Never the user's original path. */
export function storedCopiesToDelete(files: Pick<Attachment, "storedName" | "sourcePath">[]): string[] {
  return files.flatMap((file) => (file.storedName ? [file.storedName] : []));
}
