import { useMemo, useState, type MouseEvent } from "react";
import { descendantFolderIds } from "../lib/tree";
import type { Folder } from "../types";
import { useApp } from "../state/store";
import { ChevronIcon, DocIcon, FolderIcon, PlusIcon, SearchIcon } from "./icons";
import { Modal, Popover, anchorOf } from "./ui";

export function Sidebar() {
  const app = useApp();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; kind: "folder" | "experiment"; id: string } | null>(null);
  const [rename, setRename] = useState<{ kind: "folder" | "experiment"; id: string; value: string } | null>(null);
  const [remove, setRemove] = useState<{ kind: "folder" | "experiment"; id: string; name: string } | null>(null);
  const [move, setMove] = useState<{ kind: "folder" | "experiment"; id: string; dest: string | null } | null>(null);

  const q = app.sidebarQuery.trim().toLowerCase();
  const active = app.activeTab;
  const selectedFolder = active.kind === "folder" ? active.targetId : active.kind === "experiment"
    ? app.snap.experiments.find((item) => item.id === active.targetId)?.folderId
    : undefined;
  const selectedFile = active.kind === "experiment" ? active.targetId : undefined;

  const contextFolder = selectedFolder ?? app.snap.folders.find((folder) => folder.parentId === null)?.id ?? null;

  return (
    <aside className="sidebar">
      <div className="side-title">LabTrace</div>
      <label className="search">
        <SearchIcon />
        <input
          value={app.sidebarQuery}
          placeholder="搜索文件"
          onChange={(event) => app.setSidebarQuery(event.target.value)}
        />
      </label>
      <button className="btn-new" onClick={(event) => setMenu(anchorOf(event.currentTarget))}>
        <PlusIcon size={15} /> 新建
      </button>
      <div className="tree">
        {app.snap.folders
          .filter((folder) => folder.parentId === null)
          .sort((a, b) => a.order - b.order)
          .map((folder) => (
            <TreeFolder
              key={folder.id}
              folder={folder}
              depth={0}
              query={q}
              selectedFolder={selectedFolder}
              selectedFile={selectedFile}
              onContext={(event, kind, id) => {
                event.preventDefault();
                setCtx({ x: event.clientX, y: event.clientY, kind, id });
              }}
            />
          ))}
      </div>
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <button className="menu-item" onClick={() => { if (contextFolder) app.createExperiment(contextFolder); setMenu(null); }}>
          <DocIcon /> 实验文件
        </button>
        <button className="menu-item" onClick={() => { app.createFolder(contextFolder); setMenu(null); }}>
          <FolderIcon /> 文件夹
        </button>
      </Popover>
      <Popover open={!!ctx} x={ctx?.x ?? 0} y={ctx?.y ?? 0} onClose={() => setCtx(null)}>
        <button className="menu-item" onClick={() => {
          if (!ctx) return;
          const name = ctx.kind === "folder"
            ? app.snap.folders.find((folder) => folder.id === ctx.id)?.name ?? ""
            : app.snap.experiments.find((experiment) => experiment.id === ctx.id)?.title ?? "";
          setRename({ ...ctx, value: name });
          setCtx(null);
        }}><span className="mi">重命名</span></button>
        {ctx?.kind === "experiment" && (
          <button className="menu-item" onClick={() => { if (ctx) setMove({ kind: "experiment", id: ctx.id, dest: null }); setCtx(null); }}>
            移动到...
          </button>
        )}
        {ctx?.kind === "folder" && (
          <button className="menu-item" onClick={() => { if (ctx) setMove({ kind: "folder", id: ctx.id, dest: null }); setCtx(null); }}>
            移动到...
          </button>
        )}
        <button className="menu-item danger" onClick={() => {
          if (!ctx) return;
          const name = ctx.kind === "folder"
            ? app.snap.folders.find((folder) => folder.id === ctx.id)?.name ?? ""
            : app.snap.experiments.find((experiment) => experiment.id === ctx.id)?.title ?? "";
          setRemove({ ...ctx, name });
          setCtx(null);
        }}>删除</button>
      </Popover>
      {rename && (
        <Modal title="重命名" onClose={() => setRename(null)}>
          <input className="text-input" value={rename.value} autoFocus onChange={(event) => setRename({ ...rename, value: event.target.value })} />
          <div className="modal-actions">
            <button className="btn-soft" onClick={() => setRename(null)}>取消</button>
            <button className="btn-black" onClick={() => {
              if (rename.kind === "folder") app.renameFolder(rename.id, rename.value);
              else app.renameExperiment(rename.id, rename.value.trim() || "未命名实验");
              setRename(null);
            }}>保存</button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal title="删除" onClose={() => setRemove(null)}>
          <p className="confirm-copy">确定删除「{remove.name}」？此操作无法撤销。</p>
          <div className="modal-actions">
            <button className="btn-soft" onClick={() => setRemove(null)}>取消</button>
            <button className="btn-danger" onClick={() => {
              if (remove.kind === "folder") app.deleteFolder(remove.id);
              else app.deleteExperiment(remove.id);
              setRemove(null);
            }}>删除</button>
          </div>
        </Modal>
      )}
      {move && (
        <MoveDialog
          kind={move.kind}
          id={move.id}
          dest={move.dest}
          onDest={(dest) => setMove({ ...move, dest })}
          onClose={() => setMove(null)}
        />
      )}
    </aside>
  );
}

function TreeFolder({
  folder, depth, query, selectedFolder, selectedFile, onContext,
}: {
  folder: Folder;
  depth: number;
  query: string;
  selectedFolder?: string;
  selectedFile?: string;
  onContext: (event: MouseEvent, kind: "folder" | "experiment", id: string) => void;
}) {
  const app = useApp();
  const children = app.snap.folders.filter((item) => item.parentId === folder.id).sort((a, b) => a.order - b.order);
  const files = app.snap.experiments.filter((item) => item.folderId === folder.id).sort((a, b) => a.order - b.order);
  const selfMatch = !query || folder.name.toLowerCase().includes(query);
  const childMatch = children.some((item) => item.name.toLowerCase().includes(query)) || files.some((item) => item.title.toLowerCase().includes(query));
  const visibleFiles = files.filter((item) => !query || item.title.toLowerCase().includes(query) || selfMatch);
  const visibleFolders = children.filter((item) => !query || subtreeMatch(item, query, app.snap.folders, app.snap.experiments));
  if (query && !selfMatch && !childMatch && visibleFolders.length === 0 && visibleFiles.length === 0) return null;
  const open = query ? true : !!app.expanded[folder.id];
  const isRoot = depth === 0;
  return (
    <div>
      <button
        className={"tree-row" + (selectedFolder === folder.id && app.activeTab.kind === "folder" ? " on" : "") + (isRoot ? " root" : "")}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => app.openFolder(folder.id)}
        onContextMenu={(event) => onContext(event, "folder", folder.id)}
      >
        {!isRoot && (
          <span className="chev" onClick={(event) => { event.stopPropagation(); app.toggleExpanded(folder.id); }}>
            <ChevronIcon dir={open ? "down" : "right"} />
          </span>
        )}
        <FolderIcon size={16} />
        <span className="tree-name">{folder.name}</span>
        {isRoot && (
          <span className="chev right" onClick={(event) => { event.stopPropagation(); app.toggleExpanded(folder.id); }}>
            <ChevronIcon dir={open ? "up" : "down"} />
          </span>
        )}
      </button>
      {open && visibleFolders.map((child) => (
        <TreeFolder key={child.id} folder={child} depth={depth + 1} query={query} selectedFolder={selectedFolder} selectedFile={selectedFile} onContext={onContext} />
      ))}
      {open && visibleFiles.map((file) => (
        <button
          key={file.id}
          className={"tree-row file" + (selectedFile === file.id ? " on" : "")}
          style={{ paddingLeft: 28 + (depth + 1) * 14 }}
          onClick={() => app.openExperiment(file.id)}
          onContextMenu={(event) => onContext(event, "experiment", file.id)}
        >
          <DocIcon size={15} />
          <span className="tree-name">{file.title}</span>
        </button>
      ))}
    </div>
  );
}

function subtreeMatch(folder: Folder, query: string, folders: Folder[], experiments: { folderId: string; title: string }[]): boolean {
  if (folder.name.toLowerCase().includes(query)) return true;
  if (experiments.some((item) => item.folderId === folder.id && item.title.toLowerCase().includes(query))) return true;
  return folders.filter((item) => item.parentId === folder.id).some((item) => subtreeMatch(item, query, folders, experiments));
}

function MoveDialog({
  kind, id, dest, onDest, onClose,
}: {
  kind: "folder" | "experiment";
  id: string;
  dest: string | null;
  onDest: (id: string) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const banned = useMemo(() => {
    if (kind === "folder") return new Set([id, ...descendantFolderIds(app.snap.folders, id)]);
    return new Set<string>();
  }, [app.snap.folders, id, kind]);
  const current = kind === "experiment" ? app.snap.experiments.find((item) => item.id === id)?.folderId : app.snap.folders.find((item) => item.id === id)?.parentId;
  return (
    <Modal title="移动到..." onClose={onClose}>
      <div className="move-list">
        {app.snap.folders.filter((folder) => folder.parentId === null).map((folder) => (
          <MoveNode key={folder.id} folder={folder} depth={0} dest={dest} banned={banned} current={current ?? null} onDest={onDest} />
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn-soft" onClick={onClose}>取消</button>
        <button className="btn-black" disabled={!dest || dest === current || banned.has(dest)} onClick={() => {
          if (!dest) return;
          if (kind === "folder") app.moveFolder(id, dest);
          else app.moveExperiment(id, dest);
          onClose();
        }}>移动</button>
      </div>
    </Modal>
  );
}

function MoveNode({
  folder, depth, dest, banned, current, onDest,
}: {
  folder: Folder;
  depth: number;
  dest: string | null;
  banned: Set<string>;
  current: string | null;
  onDest: (id: string) => void;
}) {
  const app = useApp();
  const disabled = banned.has(folder.id) || folder.id === current;
  return (
    <>
      <button className={"move-item" + (dest === folder.id ? " on" : "")} style={{ paddingLeft: 10 + depth * 14 }} disabled={disabled} onClick={() => onDest(folder.id)}>
        <FolderIcon size={15} /> {folder.name}
      </button>
      {app.snap.folders.filter((item) => item.parentId === folder.id).sort((a, b) => a.order - b.order).map((child) => (
        <MoveNode key={child.id} folder={child} depth={depth + 1} dest={dest} banned={banned} current={current} onDest={onDest} />
      ))}
    </>
  );
}
