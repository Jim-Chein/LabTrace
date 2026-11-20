export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Experiment {
  id: string;
  folderId: string;
  title: string;
  subtitle: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlateGroup {
  id: string;
  name: string;
  color: string;
}

export interface WellMark {
  groupId?: string;
  note?: string;
}

export interface PlateData {
  title: string;
  rows: number;
  cols: number;
  groups: PlateGroup[];
  wells: Record<string, WellMark>;
  lidNotes: string;
}

export interface TextData {
  html: string;
  plain: string;
}

export type Block =
  | {
      id: string;
      experimentId: string;
      kind: "plate";
      order: number;
      updatedAt: number;
      plate: PlateData;
    }
  | {
      id: string;
      experimentId: string;
      kind: "text";
      order: number;
      updatedAt: number;
      text: TextData;
    }
  | {
      id: string;
      experimentId: string;
      kind: "files";
      order: number;
      updatedAt: number;
    };

export interface Attachment {
  id: string;
  experimentId: string;
  blockId: string;
  filename: string;
  /** Bytes copied into app storage by an older version. Absent for a path reference. */
  storedName?: string;
  /** Absolute path of the user-selected file. Never invented for an older imported copy. */
  sourcePath?: string;
  size: number;
  updatedAt: number;
}

export interface Recent {
  experimentId: string;
  openedAt: number;
}

export interface Snapshot {
  folders: Folder[];
  experiments: Experiment[];
  blocks: Block[];
  attachments: Attachment[];
  recents: Recent[];
}

export function emptySnapshot(): Snapshot {
  return {
    folders: [],
    experiments: [],
    blocks: [],
    attachments: [],
    recents: [],
  };
}

export function createId(): string {
  return crypto.randomUUID();
}

export type TabKind = "folder" | "experiment" | "recent";

export interface Tab {
  id: string;
  kind: TabKind;
  targetId?: string;
}
