import { isTauri } from "../lib/env";
import { normalizeAttachment } from "../lib/localPath";
import { emptySnapshot, type Attachment, type Block, type Experiment, type Folder, type PlateData, type Snapshot, type TextData } from "../types";

export interface Repository {
  load(): Promise<Snapshot>;
  save(snapshot: Snapshot): Promise<void>;
  writeBytes(storedName: string, bytes: Uint8Array): Promise<void>;
  readBytes(storedName: string): Promise<Uint8Array>;
  removeBytes(storedName: string): Promise<void>;
}

const STORAGE_KEY = "labtrace.snapshot.v1";
const DB_NAME = "labtrace";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("blobs")) request.result.createObjectStore("blobs");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbOp(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", mode);
    const request = run(tx.objectStore("blobs"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Scheduling fields kept only so an older browser snapshot is not wiped on save. */
export interface LegacyScheduling {
  todos?: unknown;
  ignored?: unknown;
  demoNowMs?: unknown;
}

export function withLegacyScheduling<T extends object>(snapshot: T, raw: LegacyScheduling): T {
  const next = snapshot as T & LegacyScheduling;
  if ("todos" in raw) next.todos = raw.todos;
  if ("ignored" in raw) next.ignored = raw.ignored;
  if ("demoNowMs" in raw) next.demoNowMs = raw.demoNowMs;
  return next;
}

export function createMemoryRepository(): Repository {
  const cache = new Map<string, Uint8Array>();
  return {
    async load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptySnapshot();
        const parsed = JSON.parse(raw) as Snapshot & LegacyScheduling;
        return withLegacyScheduling({
          folders: parsed.folders ?? [],
          experiments: parsed.experiments ?? [],
          blocks: parsed.blocks ?? [],
          attachments: (parsed.attachments ?? []).map((item) => normalizeAttachment(item)),
          recents: parsed.recents ?? [],
        }, parsed);
      } catch {
        return emptySnapshot();
      }
    },
    async save(snapshot) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    },
    async writeBytes(storedName, bytes) {
      const copy = new Uint8Array(bytes);
      cache.set(storedName, copy);
      await idbOp("readwrite", (store) => store.put(copy, storedName));
    },
    async readBytes(storedName) {
      const cached = cache.get(storedName);
      if (cached) return cached;
      const stored = (await idbOp("readonly", (store) => store.get(storedName))) as Uint8Array | undefined;
      if (!stored) return new Uint8Array();
      cache.set(storedName, stored);
      return stored;
    },
    async removeBytes(storedName) {
      cache.delete(storedName);
      await idbOp("readwrite", (store) => store.delete(storedName));
    },
  };
}

interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

async function openSql(): Promise<SqlDatabase> {
  const Database = (await import("@tauri-apps/plugin-sql")).default;
  return Database.load("sqlite:labtrace.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL, sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL,
  sort_order INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, kind TEXT NOT NULL,
  sort_order INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, block_id TEXT NOT NULL,
  filename TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  source_path TEXT
);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY, content TEXT NOT NULL, due_at INTEGER, completed INTEGER NOT NULL,
  completed_at INTEGER, experiment_id TEXT, source_label TEXT NOT NULL, source_block_id TEXT,
  source_style TEXT NOT NULL, tag TEXT, notified INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ignored (
  experiment_id TEXT NOT NULL, block_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  PRIMARY KEY (experiment_id, block_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS recents (
  experiment_id TEXT PRIMARY KEY, opened_at INTEGER NOT NULL
);
`;

function safeName(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("invalid attachment name");
  return name;
}

export function createTauriRepository(): Repository {
  let dbPromise: Promise<SqlDatabase> | null = null;
  const db = () => (dbPromise ??= openSql().then(async (database) => {
    for (const statement of SCHEMA.split(";").map((part) => part.trim()).filter(Boolean)) {
      await database.execute(statement);
    }
    const columns = await database.select<{ name: string }[]>("PRAGMA table_info(attachments)");
    if (!columns.some((column) => column.name === "source_path")) {
      await database.execute("ALTER TABLE attachments ADD COLUMN source_path TEXT");
    }
    return database;
  }));

  return {
    async load() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reconcile_notebook_restore");
      const database = await db();
      const folders = await database.select<FolderRow[]>("SELECT * FROM folders");
      const experiments = await database.select<ExperimentRow[]>("SELECT * FROM experiments");
      const blocks = await database.select<BlockRow[]>("SELECT * FROM blocks");
      const attachments = await database.select<AttachmentRow[]>("SELECT * FROM attachments");
      const recents = await database.select<RecentRow[]>("SELECT * FROM recents");
      return {
        folders: folders.map(folderFrom),
        experiments: experiments.map(experimentFrom),
        blocks: blocks.map(blockFrom),
        attachments: attachments.map(attachmentFrom),
        recents: recents.map((row) => ({ experimentId: row.experiment_id, openedAt: row.opened_at })),
      };
    },
    async save(snapshot) {
      const database = await db();
      await database.execute("BEGIN");
      try {
        // Leave todos, ignored, and meta in place. Those tables are unused by the
        // recorder, and deleting them would drop historical scheduling rows.
        for (const table of ["folders", "experiments", "blocks", "attachments", "recents"]) {
          await database.execute(`DELETE FROM ${table}`);
        }
        for (const folder of snapshot.folders) {
          await database.execute(
            "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
            [folder.id, folder.parentId, folder.name, folder.order, folder.createdAt, folder.updatedAt],
          );
        }
        for (const experiment of snapshot.experiments) {
          await database.execute(
            "INSERT INTO experiments (id, folder_id, title, subtitle, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [experiment.id, experiment.folderId, experiment.title, experiment.subtitle, experiment.order, experiment.createdAt, experiment.updatedAt],
          );
        }
        for (const block of snapshot.blocks) {
          await database.execute(
            "INSERT INTO blocks (id, experiment_id, kind, sort_order, updated_at, data) VALUES ($1,$2,$3,$4,$5,$6)",
            [block.id, block.experimentId, block.kind, block.order, block.updatedAt, JSON.stringify(blockPayload(block))],
          );
        }
        for (const attachment of snapshot.attachments) {
          await database.execute(
            "INSERT INTO attachments (id, experiment_id, block_id, filename, stored_name, size, updated_at, source_path) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            [attachment.id, attachment.experimentId, attachment.blockId, attachment.filename, attachment.storedName ?? "", attachment.size, attachment.updatedAt, attachment.sourcePath ?? null],
          );
        }
        for (const recent of snapshot.recents) {
          await database.execute("INSERT INTO recents (experiment_id, opened_at) VALUES ($1,$2)", [recent.experimentId, recent.openedAt]);
        }
        await database.execute("COMMIT");
      } catch (error) {
        await database.execute("ROLLBACK");
        throw error;
      }
    },
    async writeBytes(storedName, bytes) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_attachment", { storedName: safeName(storedName), bytes: Array.from(bytes) });
    },
    async readBytes(storedName) {
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = await invoke<number[]>("read_attachment", { storedName: safeName(storedName) });
      return new Uint8Array(bytes);
    },
    async removeBytes(storedName) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_attachment_file", { storedName: safeName(storedName) });
    },
  };
}

export async function createRepository(): Promise<Repository> {
  return isTauri() ? createTauriRepository() : createMemoryRepository();
}

function blockPayload(block: Block): unknown {
  if (block.kind === "plate") return block.plate;
  if (block.kind === "text") return block.text;
  return {};
}

interface FolderRow { id: string; parent_id: string | null; name: string; sort_order: number; created_at: number; updated_at: number }
interface ExperimentRow { id: string; folder_id: string; title: string; subtitle: string; sort_order: number; created_at: number; updated_at: number }
interface BlockRow { id: string; experiment_id: string; kind: string; sort_order: number; updated_at: number; data: string }
interface AttachmentRow { id: string; experiment_id: string; block_id: string; filename: string; stored_name: string; size: number; updated_at: number; source_path?: string | null }
interface RecentRow { experiment_id: string; opened_at: number }

function folderFrom(row: FolderRow): Folder {
  return { id: row.id, parentId: row.parent_id, name: row.name, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at };
}
function experimentFrom(row: ExperimentRow): Experiment {
  return { id: row.id, folderId: row.folder_id, title: row.title, subtitle: row.subtitle, order: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at };
}
function blockFrom(row: BlockRow): Block {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  if (row.kind === "plate") {
    return { id: row.id, experimentId: row.experiment_id, kind: "plate", order: row.sort_order, updatedAt: row.updated_at, plate: data as unknown as PlateData };
  }
  if (row.kind === "text") {
    return { id: row.id, experimentId: row.experiment_id, kind: "text", order: row.sort_order, updatedAt: row.updated_at, text: data as unknown as TextData };
  }
  return { id: row.id, experimentId: row.experiment_id, kind: "files", order: row.sort_order, updatedAt: row.updated_at };
}
function attachmentFrom(row: AttachmentRow): Attachment {
  return normalizeAttachment({
    id: row.id,
    experimentId: row.experiment_id,
    blockId: row.block_id,
    filename: row.filename,
    storedName: row.stored_name,
    sourcePath: row.source_path ?? undefined,
    size: row.size,
    updatedAt: row.updated_at,
  });
}
