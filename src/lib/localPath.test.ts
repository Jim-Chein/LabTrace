import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../data/repository";
import { buildDemoSnapshot } from "../data/seed";
import { emptySnapshot, type Attachment } from "../types";
import {
  fileNameOf,
  fileReference,
  inspectLocalPath,
  normalizeAttachment,
  relinkAttachment,
  storedCopiesToDelete,
} from "./localPath";

describe("local file paths", () => {
  it("accepts unicode paths and spaces on macOS and Windows", () => {
    expect(inspectLocalPath("/Users/甲/实验 数据/结果.xlsx")).toEqual({
      ok: true,
      kind: "posix",
      path: "/Users/甲/实验 数据/结果.xlsx",
    });
    expect(inspectLocalPath("C:\\实验 数据\\结果.xlsx").ok).toBe(true);
    expect(inspectLocalPath("D:/lab/结果 文件.pzfx").ok).toBe(true);
    expect(inspectLocalPath("\\\\server\\share\\实验 a.xlsx")).toMatchObject({ ok: true, kind: "unc" });
    expect(inspectLocalPath("\\\\?\\C:\\实验\\a.xlsx")).toMatchObject({ ok: true, kind: "unc" });
    expect(fileNameOf("/Users/甲/实验 数据/结果.xlsx")).toBe("结果.xlsx");
    expect(fileNameOf("C:\\实验 数据\\结果.xlsx")).toBe("结果.xlsx");
  });

  it("rejects urls, relative paths, and control characters", () => {
    for (const path of [
      "",
      "notes.xlsx",
      "./notes.xlsx",
      "../etc/passwd",
      "..\\windows\\system32",
      "C:notes.xlsx",
      "file:///tmp/a.xlsx",
      "file://localhost/tmp/a.xlsx",
      "http://example.com/a.xlsx",
      "https://example.com/a.xlsx",
      "//server/share/a.xlsx",
      "\\\\server",
      "\\\\.\\pipe",
      "/tmp/a\nname.xlsx",
      "/tmp/a\u0000.xlsx",
      "javascript:alert(1)",
    ]) {
      expect(inspectLocalPath(path).ok, path).toBe(false);
    }
  });

  it("keeps shell metacharacters inside one absolute path", () => {
    const path = "/tmp/实验 a;rm -rf.xlsx";
    const checked = inspectLocalPath(path);
    expect(checked).toEqual({ ok: true, kind: "posix", path });
  });
});

describe("file references", () => {
  it("does not invent an original path for an imported copy", () => {
    const legacy = normalizeAttachment({
      id: "old",
      experimentId: "e",
      blockId: "b",
      filename: "C:\\not-a-real-path\\copy.xlsx",
      storedName: "old.xlsx",
      size: 10,
      updatedAt: 1,
    });
    expect(legacy.sourcePath).toBeUndefined();
    expect(legacy.storedName).toBe("old.xlsx");
    expect(legacy.filename).toBe("C:\\not-a-real-path\\copy.xlsx");
    for (const file of buildDemoSnapshot().attachments) {
      expect(file.storedName).toBeTruthy();
      expect(file.sourcePath).toBeUndefined();
    }
  });

  it("relinks without dropping the imported copy or the original path", () => {
    const legacy: Attachment = {
      id: "old",
      experimentId: "e",
      blockId: "b",
      filename: "copy.xlsx",
      storedName: "stored-copy.xlsx",
      size: 10,
      updatedAt: 1,
    };
    const next = relinkAttachment(legacy, "/Users/甲/实验 数据/原文件.xlsx", { size: 22, updatedAt: 9 });
    expect(next.storedName).toBe("stored-copy.xlsx");
    expect(next.sourcePath).toBe("/Users/甲/实验 数据/原文件.xlsx");
    expect(next.filename).toBe("原文件.xlsx");
    expect(storedCopiesToDelete([next, fileReference({
      id: "n",
      experimentId: "e",
      blockId: "b",
      sourcePath: "/Users/甲/只是引用.xlsx",
      size: 1,
      updatedAt: 2,
    })])).toEqual(["stored-copy.xlsx"]);
  });

  it("refuses to build a reference from a browser file name", () => {
    expect(() => fileReference({
      id: "n",
      experimentId: "e",
      blockId: "b",
      sourcePath: "results.xlsx",
      size: 1,
      updatedAt: 1,
    })).toThrow(/invalid path/);
  });

  it("round-trips original paths and leaves legacy rows without one", async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    const repo = createMemoryRepository();
    const snap = emptySnapshot();
    snap.attachments = [
      fileReference({
        id: "linked",
        experimentId: "e",
        blockId: "b",
        sourcePath: "/Users/甲/实验 数据/结果.xlsx",
        size: 5,
        updatedAt: 8,
      }),
      {
        id: "legacy",
        experimentId: "e",
        blockId: "b",
        filename: "已导入.xlsx",
        storedName: "legacy-copy.xlsx",
        size: 3,
        updatedAt: 4,
      },
    ];
    await repo.save(snap);
    const loaded = await repo.load();
    expect(loaded.attachments[0]?.sourcePath).toBe("/Users/甲/实验 数据/结果.xlsx");
    expect(loaded.attachments[0]?.storedName).toBeUndefined();
    expect(loaded.attachments[1]?.sourcePath).toBeUndefined();
    expect(loaded.attachments[1]?.filename).toBe("已导入.xlsx");
    expect(loaded.attachments[1]?.storedName).toBe("legacy-copy.xlsx");
    vi.unstubAllGlobals();
  });
});
