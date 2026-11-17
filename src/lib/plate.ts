import type { PlateData, PlateGroup } from "../types";

export const DEFAULT_GROUPS: PlateGroup[] = [
  { id: "ctrl", name: "Ctrl", color: "#E4E0FC" },
  { id: "glu", name: "Glu", color: "#B6F2EB" },
  { id: "es", name: "ES", color: "#C3BAFB" },
  { id: "esglu", name: "ES+Glu", color: "#FEF1AA" },
];

export const PLATE_SIZES: { rows: number; cols: number; label: string }[] = [
  { rows: 2, cols: 3, label: "6孔板" },
  { rows: 3, cols: 4, label: "12孔板" },
  { rows: 4, cols: 6, label: "24孔板" },
  { rows: 6, cols: 8, label: "48孔板" },
  { rows: 8, cols: 12, label: "96孔板" },
];

export function plateSizeLabel(rows: number, cols: number): string {
  return PLATE_SIZES.find((size) => size.rows === rows && size.cols === cols)?.label ?? `${rows * cols}孔板`;
}

export function emptyPlate(title = "Plate 1"): PlateData {
  return {
    title,
    rows: 4,
    cols: 6,
    groups: DEFAULT_GROUPS.map((group) => ({ ...group })),
    wells: {},
    lidNotes: "",
  };
}

export function wellName(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export function parseWell(id: string): { r: number; c: number } {
  const match = /^([A-H])(\d+)$/.exec(id);
  if (!match) return { r: 0, c: 0 };
  return { r: match[1].charCodeAt(0) - 65, c: Number(match[2]) - 1 };
}

export function rectBetween(a: string, b: string): string[] {
  const start = parseWell(a);
  const end = parseWell(b);
  const ids: string[] = [];
  for (let row = Math.min(start.r, end.r); row <= Math.max(start.r, end.r); row += 1) {
    for (let col = Math.min(start.c, end.c); col <= Math.max(start.c, end.c); col += 1) {
      ids.push(wellName(row, col));
    }
  }
  return ids;
}

export function formatWellRange(ids: string[]): string {
  if (ids.length === 0) return "";
  const parsed = ids.map(parseWell);
  const r1 = Math.min(...parsed.map((item) => item.r));
  const r2 = Math.max(...parsed.map((item) => item.r));
  const c1 = Math.min(...parsed.map((item) => item.c));
  const c2 = Math.max(...parsed.map((item) => item.c));
  const a = wellName(r1, c1);
  const b = wellName(r2, c2);
  return a === b ? a : `${a} – ${b}`;
}

export function resizePlate(plate: PlateData, rows: number, cols: number): PlateData {
  const wells: PlateData["wells"] = {};
  for (const [id, mark] of Object.entries(plate.wells)) {
    const { r, c } = parseWell(id);
    if (r < rows && c < cols) wells[id] = mark;
  }
  return { ...plate, rows, cols, wells };
}
