import type { Folder } from "../types";

export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const out: Folder[] = [];
  let current = id ? folders.find((folder) => folder.id === id) ?? null : null;
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    out.unshift(current);
    current = current.parentId ? folders.find((folder) => folder.id === current!.parentId) ?? null : null;
  }
  return out;
}

export function descendantFolderIds(folders: Folder[], id: string): string[] {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const folder of folders) {
      if (folder.parentId === parentId) {
        out.push(folder.id);
        walk(folder.id);
      }
    }
  };
  walk(id);
  return out;
}

export function rootFolder(folders: Folder[]): Folder | undefined {
  return folders.find((folder) => folder.parentId === null) ?? folders[0];
}
