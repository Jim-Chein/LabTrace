import { describe, expect, it } from "vitest";
import { buildDemoSnapshot } from "../data/seed";
import { emptySnapshot, type Snapshot } from "../types";
import { searchNotebook } from "./search";

describe("notebook search", () => {
  it("finds Chinese and English text, notes, and file paths from the snapshot", () => {
    const snap = buildDemoSnapshot();
    const lid = searchNotebook(snap, "20:00");
    expect(lid.some((hit) => hit.kind === "lid" && hit.snippet.includes("20:00"))).toBe(true);
    const english = searchNotebook(snap, "nluc");
    expect(english.some((hit) => hit.kind === "file" && hit.title.includes("NLuc"))).toBe(true);
    const path = searchNotebook(snap, "/Users/甲/实验 数据");
    expect(path).toEqual([]);
    const withPath = addPath(snap);
    expect(searchNotebook(withPath, "实验 数据").some((hit) => hit.kind === "file")).toBe(true);
    const well = searchNotebook(withPath, "孔内记录");
    expect(well.some((hit) => hit.kind === "well" && hit.blockId)).toBe(true);
  });

  it("drops hits when the note is deleted and does not read file bytes", () => {
    const snap = addPath(buildDemoSnapshot());
    expect(searchNotebook(snap, "孔内记录")).toHaveLength(1);
    snap.blocks = snap.blocks.map((block) => {
      if (block.kind !== "plate") return block;
      return { ...block, plate: { ...block.plate, wells: {} } };
    });
    expect(searchNotebook(snap, "孔内记录")).toEqual([]);
    expect(searchNotebook(snap, "SECRET-BYTES")).toEqual([]);
  });
});

function addPath(snap: Snapshot): Snapshot {
  const experiment = snap.experiments[0];
  const block = snap.blocks.find((item) => item.kind === "plate" && item.experimentId === experiment.id);
  if (!experiment || !block || block.kind !== "plate") return snap;
  block.plate.wells.A1 = { note: "孔内记录" };
  snap.attachments.push({
    id: "linked",
    experimentId: experiment.id,
    blockId: block.id,
    filename: "结果.xlsx",
    sourcePath: "/Users/甲/实验 数据/结果.xlsx",
    size: 4,
    updatedAt: 1,
  });
  return snap;
}

describe("empty query", () => {
  it("returns nothing", () => {
    expect(searchNotebook(emptySnapshot(), "   ")).toEqual([]);
  });
});
