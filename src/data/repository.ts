import { isTauri } from "../lib/env";
import { emptySnapshot, type Attachment, type Block, type Experiment, type Folder, type PlateData, type Snapshot, type TextData, type Todo } from "../types";

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

export function createMemoryRepository(): Repository {
  const cache = new Map<string, Uint8Array>();
  return {
    async load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptySnapshot();
        return JSON.parse(raw) as Snapshot;
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
  filename TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER NOT NULL, updated_at INTEGER NOT NULL
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
    return database;
  }));

  return {
    async load() {
      const database = await db();
      const meta = await database.select<{ key: string; value: string }[]>("SELECT key, value FROM meta");
      const demo = meta.find((row) => row.key === "demoNowMs")?.value;
      const folders = await database.select<FolderRow[]>("SELECT * FROM folders");
      const experiments = await database.select<ExperimentRow[]>("SELECT * FROM experiments");
      const blocks = await database.select<BlockRow[]>("SELECT * FROM blocks");
      const attachments = await database.select<AttachmentRow[]>("SELECT * FROM attachments");
      const todos = await database.select<TodoRow[]>("SELECT * FROM todos");
      const ignored = await database.select<IgnoredRow[]>("SELECT * FROM ignored");
      const recents = await database.select<RecentRow[]>("SELECT * FROM recents");
      return {
        demoNowMs: demo ? Number(demo) : null,
        folders: folders.map(folderFrom),
        experiments: experiments.map(experimentFrom),
        blocks: blocks.map(blockFrom),
        attachments: attachments.map(attachmentFrom),
        todos: todos.map(todoFrom),
        ignored: ignored.map((row) => ({ experimentId: row.experiment_id, blockId: row.block_id, fingerprint: row.fingerprint })),
        recents: recents.map((row) => ({ experimentId: row.experiment_id, openedAt: row.opened_at })),
      };
    },
    async save(snapshot) {
      const database = await db();
      await database.execute("BEGIN");
      try {
        for (const table of ["folders", "experiments", "blocks", "attachments", "todos", "ignored", "recents", "meta"]) {
          await database.execute(`DELETE FROM ${table}`);
        }
        await database.execute("INSERT INTO meta (key, value) VALUES ($1, $2)", [
          "demoNowMs",
          snapshot.demoNowMs == null ? "" : String(snapshot.demoNowMs),
        ]);
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
            "INSERT INTO attachments (id, experiment_id, block_id, filename, stored_name, size, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [attachment.id, attachment.experimentId, attachment.blockId, attachment.filename, attachment.storedName, attachment.size, attachment.updatedAt],
          );
        }
        for (const todo of snapshot.todos) {
          await database.execute(
            `INSERT INTO todos (id, content, due_at, completed, completed_at, experiment_id, source_label, source_block_id, source_style, tag, notified, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              todo.id, todo.content, todo.dueAt, todo.completed ? 1 : 0, todo.completedAt, todo.experimentId,
              todo.sourceLabel, todo.sourceBlockId, todo.sourceStyle, todo.tag, todo.notified ? 1 : 0, todo.createdAt, todo.updatedAt,
            ],
          );
        }
        for (const item of snapshot.ignored) {
          await database.execute(
            "INSERT INTO ignored (experiment_id, block_id, fingerprint) VALUES ($1,$2,$3)",
            [item.experimentId, item.blockId, item.fingerprint],
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
interface AttachmentRow { id: string; experiment_id: string; block_id: string; filename: string; stored_name: string; size: number; updated_at: number }
interface TodoRow {
  id: string; content: string; due_at: number | null; completed: number; completed_at: number | null;
  experiment_id: string | null; source_label: string; source_block_id: string | null; source_style: string;
  tag: string | null; notified: number; created_at: number; updated_at: number;
}
interface IgnoredRow { experiment_id: string; block_id: string; fingerprint: string }
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
  return { id: row.id, experimentId: row.experiment_id, blockId: row.block_id, filename: row.filename, storedName: row.stored_name, size: row.size, updatedAt: row.updated_at };
}
function todoFrom(row: TodoRow): Todo {
  return {
    id: row.id,
    content: row.content,
    dueAt: row.due_at,
    completed: row.completed === 1,
    completedAt: row.completed_at,
    experimentId: row.experiment_id,
    sourceLabel: row.source_label,
    sourceBlockId: row.source_block_id,
    sourceStyle: row.source_style === "link" ? "link" : "record",
    tag: row.tag,
    notified: row.notified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
