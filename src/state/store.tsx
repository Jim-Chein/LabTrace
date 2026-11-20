import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { seedDemo } from "../data/seed";
import { createRepository, type Repository } from "../data/repository";
import { isTauri } from "../lib/env";
import { detachReference as detachReferencePlan, dropImportedCopy, fileReference, relinkAttachment, storedCopiesToDelete } from "../lib/localPath";
import { descendantFolderIds, rootFolder } from "../lib/tree";
import { createId, emptySnapshot, type Attachment, type Block, type Snapshot, type Tab } from "../types";

interface Focus {
  experimentId: string;
  blockId?: string;
}

interface UpdateOffer {
  version: string;
  install: () => Promise<void>;
}

interface AppApi {
  ready: boolean;
  snap: Snapshot;
  now: Date;
  saveState: "saved" | "saving";
  tabs: Tab[];
  activeTab: Tab;
  expanded: Record<string, boolean>;
  sidebarQuery: string;
  focus: Focus | null;
  toast: string | null;
  updateOffer: UpdateOffer | null;
  setSidebarQuery: (query: string) => void;
  toggleExpanded: (id: string) => void;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  newTab: () => void;
  openFolder: (id: string) => void;
  openExperiment: (id: string, opts?: { blockId?: string }) => void;
  openRecent: () => void;
  showFiles: () => void;
  createFolder: (parentId: string | null, name?: string) => void;
  createExperiment: (folderId: string) => void;
  renameFolder: (id: string, name: string) => void;
  renameExperiment: (id: string, title: string) => void;
  setSubtitle: (id: string, subtitle: string) => void;
  moveExperiment: (id: string, folderId: string) => void;
  moveFolder: (id: string, parentId: string | null) => void;
  deleteFolder: (id: string) => void;
  deleteExperiment: (id: string) => void;
  addBlock: (experimentId: string, kind: Block["kind"], plain?: string) => string;
  updateBlock: (id: string, recipe: (block: Block) => void) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, direction: -1 | 1) => void;
  linkFile: (experimentId: string, blockId: string, sourcePath: string) => Promise<void>;
  relinkFile: (id: string, sourcePath: string) => Promise<void>;
  detachReference: (id: string) => void;
  deleteImportedCopy: (id: string) => Promise<void>;
  reloadNotebook: () => Promise<void>;
  notify: (message: string) => void;
  checkUpdates: () => Promise<void>;
  clearToast: () => void;
  clearFocus: () => void;
}

const Ctx = createContext<AppApi | null>(null);

function boot(snap: Snapshot): { tabs: Tab[]; active: string; expanded: Record<string, boolean> } {
  const nofq = snap.folders.find((folder) => folder.name === "NOFQ");
  const first = snap.experiments.find((experiment) => experiment.title === "eMJ001");
  const root = rootFolder(snap.folders);
  const tabs: Tab[] = [];
  if (nofq) tabs.push({ id: "tab-nofq", kind: "folder", targetId: nofq.id });
  else if (root) tabs.push({ id: "tab-root", kind: "folder", targetId: root.id });
  if (first) tabs.push({ id: "tab-e1", kind: "experiment", targetId: first.id });
  if (!tabs.length) tabs.push({ id: "tab-empty", kind: "recent" });
  const expanded: Record<string, boolean> = {};
  if (root) expanded[root.id] = true;
  if (nofq) expanded[nofq.id] = true;
  return { tabs, active: tabs[0].id, expanded };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repository | null>(null);
  const snapRef = useRef<Snapshot>(emptySnapshot());
  const timer = useRef<number>(0);
  const [snap, setSnap] = useState<Snapshot>(emptySnapshot());
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [updateOffer, setUpdateOffer] = useState<UpdateOffer | null>(null);

  const commit = (recipe: (draft: Snapshot) => void, immediate = false) => {
    const next = structuredClone(snapRef.current);
    recipe(next);
    snapRef.current = next;
    setSnap(next);
    setSaveState("saving");
    window.clearTimeout(timer.current);
    const persist = () => {
      void repoRef.current?.save(snapRef.current).then(
        () => setSaveState("saved"),
        () => {
          setSaveState("saved");
          setToast("保存失败");
        },
      );
    };
    if (immediate) persist();
    else timer.current = window.setTimeout(persist, 420);
  };

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const repo = await createRepository();
      repoRef.current = repo;
      let loaded = await repo.load();
      if (loaded.folders.length === 0) loaded = await seedDemo(repo);
      if (cancel) return;
      snapRef.current = loaded;
      setSnap(loaded);
      const started = boot(loaded);
      setTabs(started.tabs);
      setActiveTabId(started.active);
      setExpanded(started.expanded);
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      void repoRef.current?.save(snapRef.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  const now = new Date();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? { id: "tab-empty", kind: "recent" as const };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 4200);
  };

  const focusTab = (next: Tab[], id: string) => {
    setTabs(next);
    setActiveTabId(id);
  };

  const openUnique = (kind: Tab["kind"], targetId?: string, replaceFolder = false) => {
    const existing = tabs.find((tab) => tab.kind === kind && tab.targetId === targetId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const id = createId();
    if (replaceFolder && activeTab.kind === "folder") {
      focusTab(tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, kind, targetId } : tab)), activeTab.id);
      return;
    }
    focusTab([...tabs, { id, kind, targetId }], id);
  };

  const api: AppApi = {
    ready,
    snap,
    now,
    saveState,
    tabs,
    activeTab,
    expanded,
    sidebarQuery,
    focus,
    toast,
    updateOffer,
    setSidebarQuery,
    toggleExpanded: (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] })),
    setActiveTab: setActiveTabId,
    closeTab: (id) => {
      const next = tabs.filter((tab) => tab.id !== id);
      const fallback = next.length ? next : [{ id: createId(), kind: "folder" as const, targetId: rootFolder(snap.folders)?.id }];
      setTabs(fallback);
      if (activeTabId === id) setActiveTabId(fallback[Math.max(0, tabs.findIndex((tab) => tab.id === id) - 1)]?.id ?? fallback[0].id);
    },
    newTab: () => {
      const id = createId();
      const targetId = rootFolder(snap.folders)?.id;
      focusTab([...tabs, { id, kind: "folder", targetId }], id);
    },
    openFolder: (id) => openUnique("folder", id, true),
    openExperiment: (id, opts) => {
      commit((draft) => {
        const opened = Date.now();
        const recent = draft.recents.find((item) => item.experimentId === id);
        if (recent) recent.openedAt = opened;
        else draft.recents.push({ experimentId: id, openedAt: opened });
      });
      openUnique("experiment", id);
      setFocus(opts?.blockId ? { experimentId: id, blockId: opts.blockId } : { experimentId: id });
    },
    openRecent: () => openUnique("recent"),
    showFiles: () => {
      const fileTab = [...tabs].reverse().find((tab) => tab.kind === "folder" || tab.kind === "experiment");
      if (fileTab) setActiveTabId(fileTab.id);
      else api.newTab();
    },
    createFolder: (parentId, name = "未命名文件夹") => {
      commit((draft) => {
        const order = draft.folders.filter((folder) => folder.parentId === parentId).reduce((max, folder) => Math.max(max, folder.order), -1) + 1;
        const ts = Date.now();
        draft.folders.push({ id: createId(), parentId, name, order, createdAt: ts, updatedAt: ts });
      }, true);
      if (parentId) setExpanded((prev) => ({ ...prev, [parentId]: true }));
    },
    createExperiment: (folderId) => {
      const id = createId();
      commit((draft) => {
        const order = draft.experiments.filter((experiment) => experiment.folderId === folderId).reduce((max, experiment) => Math.max(max, experiment.order), -1) + 1;
        const ts = Date.now();
        draft.experiments.push({ id, folderId, title: "未命名实验", subtitle: "", order, createdAt: ts, updatedAt: ts });
      }, true);
      setExpanded((prev) => ({ ...prev, [folderId]: true }));
      openUnique("experiment", id);
    },
    renameFolder: (id, name) => commit((draft) => {
      const folder = draft.folders.find((item) => item.id === id);
      if (folder) {
        folder.name = name.trim() || folder.name;
        folder.updatedAt = Date.now();
      }
    }),
    renameExperiment: (id, title) => commit((draft) => {
      const experiment = draft.experiments.find((item) => item.id === id);
      if (experiment) {
        experiment.title = title;
        experiment.updatedAt = Date.now();
      }
    }),
    setSubtitle: (id, subtitle) => commit((draft) => {
      const experiment = draft.experiments.find((item) => item.id === id);
      if (experiment) {
        experiment.subtitle = subtitle;
        experiment.updatedAt = Date.now();
      }
    }),
    moveExperiment: (id, folderId) => commit((draft) => {
      const experiment = draft.experiments.find((item) => item.id === id);
      if (experiment) {
        experiment.folderId = folderId;
        experiment.updatedAt = Date.now();
      }
    }, true),
    moveFolder: (id, parentId) => {
      if (parentId === id) return;
      const banned = new Set([id, ...descendantFolderIds(snap.folders, id)]);
      if (parentId && banned.has(parentId)) return;
      commit((draft) => {
        const folder = draft.folders.find((item) => item.id === id);
        if (folder) {
          folder.parentId = parentId;
          folder.updatedAt = Date.now();
        }
      }, true);
    },
    deleteFolder: (id) => {
      const ids = new Set([id, ...descendantFolderIds(snap.folders, id)]);
      const experimentIds = new Set(snap.experiments.filter((experiment) => ids.has(experiment.folderId)).map((experiment) => experiment.id));
      const names = storedCopiesToDelete(snap.attachments.filter((item) => experimentIds.has(item.experimentId)));
      commit((draft) => {
        removeExperiments(draft, experimentIds);
        draft.folders = draft.folders.filter((folder) => !ids.has(folder.id));
      }, true);
      for (const name of names) void repoRef.current?.removeBytes(name);
      setTabs((prev) => {
        const next = prev.filter((tab) => !(tab.kind === "folder" && tab.targetId && ids.has(tab.targetId)) && !(tab.kind === "experiment" && tab.targetId && experimentIds.has(tab.targetId)));
        const fallback = next.length ? next : [{ id: createId(), kind: "folder" as const, targetId: rootFolder(snap.folders.filter((folder) => !ids.has(folder.id)))?.id }];
        if (!fallback.some((tab) => tab.id === activeTabId)) setActiveTabId(fallback[0].id);
        return fallback;
      });
    },
    deleteExperiment: (id) => {
      const names = storedCopiesToDelete(snap.attachments.filter((item) => item.experimentId === id));
      commit((draft) => removeExperiments(draft, new Set([id])), true);
      for (const name of names) void repoRef.current?.removeBytes(name);
      setTabs((prev) => {
        const next = prev.filter((tab) => !(tab.kind === "experiment" && tab.targetId === id));
        const fallback = next.length ? next : [{ id: createId(), kind: "folder" as const, targetId: rootFolder(snap.folders)?.id }];
        if (!fallback.some((tab) => tab.id === activeTabId)) setActiveTabId(fallback[0].id);
        return fallback;
      });
    },
    addBlock: (experimentId, kind, plain) => {
      const id = createId();
      commit((draft) => {
        const siblings = draft.blocks.filter((block) => block.experimentId === experimentId);
        const order = siblings.reduce((max, block) => Math.max(max, block.order), -1) + 1;
        const ts = Date.now();
        if (kind === "plate") {
          const count = siblings.filter((block) => block.kind === "plate").length + 1;
          draft.blocks.push({
            id, experimentId, kind, order, updatedAt: ts,
            plate: {
              title: `Plate ${count}`,
              rows: 4,
              cols: 6,
              groups: [
                { id: "ctrl", name: "Ctrl", color: "#E4E0FC" },
                { id: "glu", name: "Glu", color: "#B6F2EB" },
                { id: "es", name: "ES", color: "#C3BAFB" },
                { id: "esglu", name: "ES+Glu", color: "#FEF1AA" },
              ],
              wells: {},
              lidNotes: "",
            },
          });
        } else if (kind === "text") {
          const safe = (plain ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
          draft.blocks.push({
            id, experimentId, kind, order, updatedAt: ts,
            text: { html: plain ? `<p>${safe}</p>` : "<p></p>", plain: plain ?? "" },
          });
        } else {
          draft.blocks.push({ id, experimentId, kind, order, updatedAt: ts });
        }
        const experiment = draft.experiments.find((item) => item.id === experimentId);
        if (experiment) experiment.updatedAt = ts;
      });
      return id;
    },
    updateBlock: (id, recipe) => commit((draft) => {
      const block = draft.blocks.find((item) => item.id === id);
      if (!block) return;
      recipe(block);
      block.updatedAt = Date.now();
      const experiment = draft.experiments.find((item) => item.id === block.experimentId);
      if (experiment) experiment.updatedAt = block.updatedAt;
    }),
    deleteBlock: (id) => {
      const names = storedCopiesToDelete(snapRef.current.attachments.filter((item) => item.blockId === id));
      commit((draft) => {
        draft.blocks = draft.blocks.filter((item) => item.id !== id);
        draft.attachments = draft.attachments.filter((item) => item.blockId !== id);
      }, true);
      for (const name of names) void repoRef.current?.removeBytes(name);
    },
    moveBlock: (id, direction) => commit((draft) => {
      const block = draft.blocks.find((item) => item.id === id);
      if (!block) return;
      const siblings = draft.blocks.filter((item) => item.experimentId === block.experimentId).sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((item) => item.id === id);
      const swap = siblings[index + direction];
      if (!swap) return;
      const order = block.order;
      block.order = swap.order;
      swap.order = order;
    }),
    linkFile: async (experimentId, blockId, sourcePath) => {
      let attachment: Attachment;
      try {
        attachment = fileReference({ id: createId(), experimentId, blockId, sourcePath, size: 0, updatedAt: Date.now() });
      } catch {
        notify("只能关联本机文件的绝对路径");
        return;
      }
      if (snapRef.current.attachments.some((item) => item.blockId === blockId && item.sourcePath === attachment.sourcePath)) {
        notify("这个文件已经关联过");
        return;
      }
      if (isTauri()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const sourcePath = attachment.sourcePath;
          if (!sourcePath) return;
          const info = await invoke<{ exists: boolean; isFile: boolean; size: number; modifiedMs: number }>("local_file_status", { path: sourcePath });
          if (!info.exists) {
            notify("找不到这个文件，可能已移动或未挂载");
            return;
          }
          if (!info.isFile) {
            notify("请选择文件");
            return;
          }
          attachment.size = info.size;
          if (info.modifiedMs) attachment.updatedAt = info.modifiedMs;
        } catch {
          notify("无法读取该路径");
          return;
        }
      }
      commit((draft) => {
        draft.attachments.push(attachment);
        const experiment = draft.experiments.find((item) => item.id === experimentId);
        if (experiment) experiment.updatedAt = Date.now();
      }, true);
    },
    relinkFile: async (id, sourcePath) => {
      const current = snapRef.current.attachments.find((item) => item.id === id);
      if (!current) return;
      let next: Attachment;
      try {
        next = relinkAttachment(current, sourcePath, { size: current.size, updatedAt: Date.now() });
      } catch {
        notify("只能关联本机文件的绝对路径");
        return;
      }
      if (isTauri()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const sourcePath = next.sourcePath;
          if (!sourcePath) return;
          const info = await invoke<{ exists: boolean; isFile: boolean; size: number; modifiedMs: number }>("local_file_status", { path: sourcePath });
          if (!info.exists) {
            notify("找不到这个文件，可能已移动或未挂载");
            return;
          }
          if (!info.isFile) {
            notify("请选择文件");
            return;
          }
          next.size = info.size;
          if (info.modifiedMs) next.updatedAt = info.modifiedMs;
        } catch {
          notify("无法读取该路径");
          return;
        }
      }
      commit((draft) => {
        const file = draft.attachments.find((item) => item.id === id);
        if (!file) return;
        file.sourcePath = next.sourcePath;
        file.filename = next.filename;
        file.size = next.size;
        file.updatedAt = next.updatedAt;
      }, true);
    },
    detachReference: (id) => {
      commit((draft) => {
        const index = draft.attachments.findIndex((item) => item.id === id);
        if (index < 0) return;
        const next = detachReferencePlan(draft.attachments[index]);
        if (!next) draft.attachments.splice(index, 1);
        else draft.attachments[index] = next;
      }, true);
    },
    deleteImportedCopy: async (id) => {
      const attachment = snapRef.current.attachments.find((item) => item.id === id);
      if (!attachment) return;
      const plan = dropImportedCopy(attachment);
      if (!plan.storedName) return;
      await repoRef.current?.removeBytes(plan.storedName);
      commit((draft) => {
        const index = draft.attachments.findIndex((item) => item.id === id);
        if (index < 0) return;
        if (!plan.next) draft.attachments.splice(index, 1);
        else draft.attachments[index] = plan.next;
      }, true);
    },
    reloadNotebook: async () => {
      const loaded = await repoRef.current?.load();
      if (!loaded) return;
      snapRef.current = loaded;
      setSnap(loaded);
    },
    notify,
    checkUpdates: async () => {
      if (!isTauri()) {
        setToast("浏览器预览不会连接更新服务器。安装桌面版后可在此检查 GitHub Releases。");
        return;
      }
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) {
          setUpdateOffer(null);
          setToast("已是最新版本");
          return;
        }
        setUpdateOffer({
          version: update.version,
          install: async () => {
            setToast(`正在下载 ${update.version}…`);
            await update.downloadAndInstall();
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          },
        });
        setToast(`发现新版本 ${update.version}`);
      } catch {
        setToast("检查更新失败");
      }
    },
    clearToast: () => setToast(null),
    clearFocus: () => setFocus(null),
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function removeExperiments(draft: Snapshot, ids: Set<string>) {
  draft.experiments = draft.experiments.filter((experiment) => !ids.has(experiment.id));
  draft.blocks = draft.blocks.filter((block) => !ids.has(block.experimentId));
  draft.attachments = draft.attachments.filter((item) => !ids.has(item.experimentId));
  draft.recents = draft.recents.filter((item) => !ids.has(item.experimentId));
}

export function useApp(): AppApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp outside provider");
  return value;
}
