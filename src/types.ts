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
  storedName: string;
  size: number;
  updatedAt: number;
}

/** record: gray "eMJ002 · 来自实验记录". link: purple "eMJ001 > Plate1". */
export type SourceStyle = "record" | "link";

export interface Todo {
  id: string;
  content: string;
  dueAt: number | null;
  completed: boolean;
  completedAt: number | null;
  experimentId: string | null;
  sourceLabel: string;
  sourceBlockId: string | null;
  sourceStyle: SourceStyle;
  tag: string | null;
  notified: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface IgnoredSuggestion {
  experimentId: string;
  blockId: string;
  fingerprint: string;
}

export interface Recent {
  experimentId: string;
  openedAt: number;
}

export interface Snapshot {
  /** Sample notebook clock. Null means the real system clock. */
  demoNowMs: number | null;
  folders: Folder[];
  experiments: Experiment[];
  blocks: Block[];
  attachments: Attachment[];
  todos: Todo[];
  ignored: IgnoredSuggestion[];
  recents: Recent[];
}

export function emptySnapshot(): Snapshot {
  return {
    demoNowMs: null,
    folders: [],
    experiments: [],
    blocks: [],
    attachments: [],
    todos: [],
    ignored: [],
    recents: [],
  };
}

export function createId(): string {
  return crypto.randomUUID();
}

export type TabKind = "folder" | "experiment" | "todo" | "recent";

export interface Tab {
  id: string;
  kind: TabKind;
  targetId?: string;
}
