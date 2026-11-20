import { describe, expect, it } from "vitest";
import { buildDemoSnapshot, DEMO_LID_NOTES } from "./seed";
import { emptySnapshot } from "../types";
import { withLegacyScheduling } from "./repository";

describe("experiment records", () => {
  it("keeps manually typed dates in lid notes", () => {
    const plate = buildDemoSnapshot().blocks.find((block) => block.kind === "plate");
    expect(plate && plate.kind === "plate" ? plate.plate.lidNotes : "").toBe(DEMO_LID_NOTES);
    expect(DEMO_LID_NOTES).toContain("9/9 14:00 Glu 1 mM，刺激 6 h");
    expect(DEMO_LID_NOTES).toContain("20:00 测 NLuc");
  });

  it("stores created and updated times on the sample notebook", () => {
    const snap = buildDemoSnapshot();
    for (const experiment of snap.experiments) {
      expect(experiment.createdAt).toBeGreaterThan(0);
      expect(experiment.updatedAt).toBeGreaterThan(0);
    }
    expect(snap.experiments.find((item) => item.title === "eMJ001")?.updatedAt).toBe(
      new Date(2026, 8, 8, 11, 24).getTime(),
    );
  });
});

describe("legacy scheduling data", () => {
  it("round-trips old todo rows without treating them as the current record", () => {
    const saved = withLegacyScheduling(emptySnapshot(), {
      todos: [{ id: "old", content: "准备转染试剂" }],
      ignored: [{ fingerprint: "kept" }],
      demoNowMs: 1,
    });
    const again = JSON.parse(JSON.stringify(saved)) as {
      todos?: { id: string }[];
      ignored?: { fingerprint: string }[];
      demoNowMs?: number;
      folders: unknown[];
    };
    expect(again.todos).toEqual([{ id: "old", content: "准备转染试剂" }]);
    expect(again.ignored).toEqual([{ fingerprint: "kept" }]);
    expect(again.demoNowMs).toBe(1);
    expect(again.folders).toEqual([]);
    expect(saved).not.toHaveProperty("now");
  });
});
