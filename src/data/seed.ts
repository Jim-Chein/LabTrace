import { mb } from "../lib/format";
import { type Repository } from "./repository";
import type { Snapshot } from "../types";

export const DEMO_NOW = new Date(2026, 8, 8, 11, 30, 0);

export const DEMO_LID_NOTES = `HEK293T
9/7 14:00 铺板
mGluR2 + CRE-Nluc
9/8 10:00 转染
9/9 14:00 Glu 1 mM，刺激 6 h
20:00 测 NLuc`;

const IDS = {
  root: "folder-root",
  nofq: "folder-nofq",
  lrp: "folder-lrp1",
  refs: "folder-refs",
  e1: "exp-emj001",
  e2: "exp-emj002",
  e3: "exp-emj003",
  plate: "block-plate-1",
  files1: "block-files-1",
  text2: "block-text-2",
  files2: "block-files-2",
  aXlsx: "att-emj001-xlsx",
  aPzfx: "att-emj001-pzfx",
  aOpju: "att-emj001-opju",
  aGrad: "att-emj002-xlsx",
  t1: "todo-prep",
  t2: "todo-observe",
  t3: "todo-glu",
  t4: "todo-nluc",
};

function at(month: number, day: number, hour: number, minute: number): number {
  return new Date(2026, month - 1, day, hour, minute, 0, 0).getTime();
}

function placeholder(label: string): Uint8Array {
  return new TextEncoder().encode(`LabTrace demo\n${label}\n`);
}

export function buildDemoSnapshot(): Snapshot {
  const created = at(9, 6, 9, 0);
  return {
    demoNowMs: DEMO_NOW.getTime(),
    folders: [
      { id: IDS.root, parentId: null, name: "我的文件夹", order: 0, createdAt: created, updatedAt: created },
      { id: IDS.nofq, parentId: IDS.root, name: "NOFQ", order: 0, createdAt: created, updatedAt: at(9, 8, 11, 24) },
      { id: IDS.lrp, parentId: IDS.root, name: "LRP1", order: 1, createdAt: created, updatedAt: created },
      { id: IDS.refs, parentId: IDS.root, name: "参考资料", order: 2, createdAt: created, updatedAt: created },
    ],
    experiments: [
      {
        id: IDS.e1,
        folderId: IDS.nofq,
        title: "eMJ001",
        subtitle: "HEK293T · 转染与 NLuc 检测",
        order: 0,
        createdAt: at(9, 7, 14, 0),
        updatedAt: at(9, 8, 11, 24),
      },
      {
        id: IDS.e2,
        folderId: IDS.nofq,
        title: "eMJ002",
        subtitle: "药物浓度梯度",
        order: 1,
        createdAt: at(9, 7, 16, 0),
        updatedAt: at(9, 8, 9, 10),
      },
      {
        id: IDS.e3,
        folderId: IDS.nofq,
        title: "eMJ003",
        subtitle: "",
        order: 2,
        createdAt: at(9, 7, 16, 30),
        updatedAt: at(9, 7, 16, 30),
      },
    ],
    blocks: [
      {
        id: IDS.plate,
        experimentId: IDS.e1,
        kind: "plate",
        order: 0,
        updatedAt: at(9, 8, 11, 0),
        plate: {
          title: "Plate 1",
          rows: 4,
          cols: 6,
          groups: [
            { id: "ctrl", name: "Ctrl", color: "#E4E0FC" },
            { id: "glu", name: "Glu", color: "#B6F2EB" },
            { id: "es", name: "ES", color: "#C3BAFB" },
            { id: "esglu", name: "ES+Glu", color: "#FEF1AA" },
          ],
          wells: {
            A1: { groupId: "ctrl" },
            A2: { groupId: "ctrl" },
            A3: { groupId: "ctrl" },
            A4: { groupId: "glu", note: "Glu 1 mM" },
            A5: { groupId: "glu", note: "Glu 1 mM" },
            A6: { groupId: "glu", note: "Glu 1 mM" },
            B1: { groupId: "es" },
            B2: { groupId: "es" },
            B3: { groupId: "es" },
            B4: { groupId: "esglu" },
            B5: { groupId: "esglu" },
            B6: { groupId: "esglu" },
          },
          lidNotes: DEMO_LID_NOTES,
        },
      },
      { id: IDS.files1, experimentId: IDS.e1, kind: "files", order: 1, updatedAt: at(9, 8, 10, 23) },
      {
        id: IDS.text2,
        experimentId: IDS.e2,
        kind: "text",
        order: 0,
        updatedAt: at(9, 8, 9, 10),
        text: {
          html: "<p>设置 Glu 浓度梯度，比较细胞响应。</p>",
          plain: "设置 Glu 浓度梯度，比较细胞响应。",
        },
      },
      { id: IDS.files2, experimentId: IDS.e2, kind: "files", order: 1, updatedAt: at(9, 8, 9, 10) },
    ],
    attachments: [
      {
        id: IDS.aXlsx,
        experimentId: IDS.e1,
        blockId: IDS.files1,
        filename: "eMJ001_NLuc.xlsx",
        storedName: `${IDS.aXlsx}.xlsx`,
        size: mb(2.4),
        updatedAt: at(9, 8, 10, 20),
      },
      {
        id: IDS.aPzfx,
        experimentId: IDS.e1,
        blockId: IDS.files1,
        filename: "eMJ001_NLuc.pzfx",
        storedName: `${IDS.aPzfx}.pzfx`,
        size: mb(8.1),
        updatedAt: at(9, 8, 10, 21),
      },
      {
        id: IDS.aOpju,
        experimentId: IDS.e1,
        blockId: IDS.files1,
        filename: "eMJ001_final.opju",
        storedName: `${IDS.aOpju}.opju`,
        size: mb(1.2),
        updatedAt: at(9, 8, 10, 23),
      },
      {
        id: IDS.aGrad,
        experimentId: IDS.e2,
        blockId: IDS.files2,
        filename: "eMJ002_gradient.xlsx",
        storedName: `${IDS.aGrad}.xlsx`,
        size: mb(3.2),
        updatedAt: at(9, 8, 9, 10),
      },
    ],
    todos: [
      {
        id: IDS.t1,
        content: "准备转染试剂",
        dueAt: at(9, 8, 15, 0),
        completed: false,
        completedAt: null,
        experimentId: IDS.e2,
        sourceLabel: "实验记录",
        sourceBlockId: IDS.text2,
        sourceStyle: "record",
        tag: null,
        notified: false,
        createdAt: at(9, 8, 9, 0),
        updatedAt: at(9, 8, 9, 0),
      },
      {
        id: IDS.t2,
        content: "观察细胞状态",
        dueAt: at(9, 8, 17, 0),
        completed: false,
        completedAt: null,
        experimentId: IDS.e1,
        sourceLabel: "Plate1",
        sourceBlockId: IDS.plate,
        sourceStyle: "record",
        tag: null,
        notified: false,
        createdAt: at(9, 8, 9, 30),
        updatedAt: at(9, 8, 9, 30),
      },
      {
        id: IDS.t3,
        content: "Glu 1 mM 加药",
        dueAt: at(9, 9, 14, 0),
        completed: false,
        completedAt: null,
        experimentId: IDS.e1,
        sourceLabel: "Plate1",
        sourceBlockId: IDS.plate,
        sourceStyle: "link",
        tag: "从记录添加",
        notified: false,
        createdAt: at(9, 8, 10, 0),
        updatedAt: at(9, 8, 10, 0),
      },
      {
        id: IDS.t4,
        content: "测 NLuc",
        dueAt: at(9, 7, 20, 0),
        completed: true,
        completedAt: at(9, 7, 20, 30),
        experimentId: IDS.e1,
        sourceLabel: "实验记录",
        sourceBlockId: null,
        sourceStyle: "record",
        tag: null,
        notified: true,
        createdAt: at(9, 7, 18, 0),
        updatedAt: at(9, 7, 20, 30),
      },
    ],
    ignored: [],
    recents: [
      { experimentId: IDS.e1, openedAt: at(9, 8, 11, 20) },
      { experimentId: IDS.e2, openedAt: at(9, 8, 9, 12) },
      { experimentId: IDS.e3, openedAt: at(9, 7, 16, 40) },
    ],
  };
}

export async function seedDemo(repo: Repository): Promise<Snapshot> {
  const snap = buildDemoSnapshot();
  await repo.save(snap);
  const files: [string, string][] = [
    [`${IDS.aXlsx}.xlsx`, "eMJ001_NLuc.xlsx"],
    [`${IDS.aPzfx}.pzfx`, "eMJ001_NLuc.pzfx"],
    [`${IDS.aOpju}.opju`, "eMJ001_final.opju"],
    [`${IDS.aGrad}.xlsx`, "eMJ002_gradient.xlsx"],
  ];
  for (const [storedName, label] of files) {
    await repo.writeBytes(storedName, placeholder(label));
  }
  return snap;
}
