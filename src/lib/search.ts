import type { Snapshot } from "../types";

export type SearchKind = "folder" | "experiment" | "text" | "lid" | "well" | "file";

export interface SearchHit {
  id: string;
  kind: SearchKind;
  title: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  folderId?: string;
  experimentId?: string;
  blockId?: string;
}

const KIND_ORDER: Record<SearchKind, number> = {
  folder: 0,
  experiment: 1,
  text: 2,
  lid: 3,
  well: 4,
  file: 5,
};

/** Search the notebook already in memory. External file bytes are not an input. */
export function searchNotebook(snap: Snapshot, query: string, limit = 30): SearchHit[] {
  const terms = fold(query).split(/\s+/).filter((term) => term.length > 0);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  const consider = (hit: Omit<SearchHit, "snippet" | "matchStart" | "matchEnd">, text: string) => {
    const folded = fold(text);
    if (!terms.every((term) => folded.includes(term))) return;
    const snippet = makeSnippet(text, terms[0]);
    hits.push({ ...hit, ...snippet });
  };

  for (const folder of snap.folders) {
    consider({ id: `folder:${folder.id}`, kind: "folder", title: folder.name, folderId: folder.id }, folder.name);
  }
  for (const experiment of snap.experiments) {
    consider(
      { id: `experiment:${experiment.id}`, kind: "experiment", title: experiment.title, experimentId: experiment.id, folderId: experiment.folderId },
      `${experiment.title}\n${experiment.subtitle}`,
    );
  }
  for (const block of snap.blocks) {
    if (block.kind === "text") {
      consider(
        { id: `text:${block.id}`, kind: "text", title: experimentTitle(snap, block.experimentId), experimentId: block.experimentId, blockId: block.id },
        block.text.plain,
      );
    } else if (block.kind === "plate") {
      consider(
        { id: `lid:${block.id}`, kind: "lid", title: experimentTitle(snap, block.experimentId), experimentId: block.experimentId, blockId: block.id },
        block.plate.lidNotes,
      );
      for (const [well, mark] of Object.entries(block.plate.wells)) {
        if (!mark.note) continue;
        consider(
          { id: `well:${block.id}:${well}`, kind: "well", title: `${experimentTitle(snap, block.experimentId)} · ${well}`, experimentId: block.experimentId, blockId: block.id },
          `${well} ${mark.note}`,
        );
      }
    }
  }
  for (const file of snap.attachments) {
    const body = [file.filename, file.sourcePath ?? ""].filter(Boolean).join("\n");
    consider(
      { id: `file:${file.id}`, kind: "file", title: file.filename, experimentId: file.experimentId, blockId: file.blockId },
      body,
    );
  }
  hits.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, "zh-CN"));
  return hits.slice(0, limit);
}

export function searchKindLabel(kind: SearchKind): string {
  if (kind === "folder") return "文件夹";
  if (kind === "experiment") return "实验";
  if (kind === "text") return "文本";
  if (kind === "lid") return "板盖备注";
  if (kind === "well") return "孔备注";
  return "结果文件";
}

function experimentTitle(snap: Snapshot, id: string): string {
  return snap.experiments.find((item) => item.id === id)?.title ?? "实验";
}

function fold(value: string): string {
  return value.toLocaleLowerCase();
}

function makeSnippet(text: string, term: string): { snippet: string; matchStart: number; matchEnd: number } {
  const folded = fold(text);
  const at = folded.indexOf(term);
  if (at < 0) return { snippet: text.slice(0, 80), matchStart: 0, matchEnd: 0 };
  const start = Math.max(0, at - 18);
  const end = Math.min(text.length, at + term.length + 18);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const snippet = `${prefix}${text.slice(start, end)}${suffix}`;
  const matchStart = prefix.length + (at - start);
  return { snippet, matchStart, matchEnd: matchStart + term.length };
}
