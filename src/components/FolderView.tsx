import { useMemo, useState } from "react";
import { formatBytes, formatFolderTime } from "../lib/format";
import { searchNotebook } from "../lib/search";
import { Snippet } from "./Sidebar";
import { folderPath } from "../lib/tree";
import { useApp } from "../state/store";
import type { Experiment, Folder } from "../types";
import { DocIcon, FolderIcon, MoreIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons";
import { Modal, Popover, anchorOf } from "./ui";

type SortKey = "updated" | "name" | "size";

export function FolderView({ folderId }: { folderId: string }) {
  const app = useApp();
  const folder = app.snap.folders.find((item) => item.id === folderId);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [sortOpen, setSortOpen] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "folder" | "experiment"; id: string } | null>(null);
  const [rename, setRename] = useState<{ kind: "folder" | "experiment"; id: string; value: string } | null>(null);
  const [remove, setRemove] = useState<{ kind: "folder" | "experiment"; id: string; name: string } | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);

  const sizeOf = (experimentId: string) => app.snap.attachments.filter((item) => item.experimentId === experimentId).reduce((sum, item) => sum + item.size, 0);
  const rows = useMemo(() => {
    if (!folder) return [];
    const q = query.trim().toLowerCase();
    const hits = q ? searchNotebook(app.snap, query) : [];
    const folders = app.snap.folders.filter((item) => item.parentId === folder.id && (!q || item.name.toLowerCase().includes(q)));
    const files = app.snap.experiments.filter((item) => {
      if (item.folderId !== folder.id) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q) || hits.some((hit) => hit.experimentId === item.id);
    });
    const decorated = [
      ...folders.map((item) => ({ kind: "folder" as const, folder: item, ts: item.updatedAt, name: item.name, size: 0 })),
      ...files.map((item) => ({ kind: "experiment" as const, experiment: item, ts: item.updatedAt, name: item.title, size: sizeOf(item.id) })),
    ];
    decorated.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sort === "size") return b.size - a.size;
      return b.ts - a.ts;
    });
    return decorated;
  }, [app.snap, folder, query, sort]);

  if (!folder) return <div className="page"><p className="muted">文件夹不存在</p></div>;
  const chain = folderPath(app.snap.folders, folder.id).slice(1, -1);
  const fileCount = app.snap.experiments.filter((item) => item.folderId === folder.id).length;
  const sortLabel = sort === "name" ? "名称" : sort === "size" ? "大小" : "最近修改";

  return (
    <div className="page">
      <Breadcrumb chain={chain} current={folder.name} />
      <div className="page-head">
        <div className="titles">
          <h1 className="page-title">{folder.name}</h1>
          <p className="count-line">{fileCount}个实验文件</p>
        </div>
        <div className="head-actions">
          <button className="btn-black" onClick={() => app.createExperiment(folder.id)}><PlusIcon size={15} /> 新建实验文件</button>
          <button className="btn-soft" onClick={() => app.createFolder(folder.id)}><FolderIcon size={16} /> 新建文件夹</button>
        </div>
      </div>
      <div className="tool-row">
        <label className="pill-search">
          <SearchIcon />
          <input value={query} placeholder="在此文件夹中搜索" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className="pill" onClick={(event) => setSortOpen(anchorOf(event.currentTarget))}>{sortLabel} ▾</button>
      </div>
      <section className="card">
        <div className="thead folder-cols">
          <span>名称</span><span>修改时间</span><span>大小</span><span />
        </div>
        {rows.length === 0 && <p className="empty-line">此文件夹是空的</p>}
        {rows.map((row) => {
          const id = row.kind === "folder" ? row.folder.id : row.experiment.id;
          const active = menu?.id === id;
          return (
            <div
              key={id}
              className={"trow folder-cols" + (active ? " on" : "")}
              onClick={() => row.kind === "folder" ? app.openFolder(row.folder.id) : app.openExperiment(row.experiment.id)}
            >
              <div className="name-cell">
                <span className="file-badge">{row.kind === "folder" ? <FolderIcon size={16} /> : <DocIcon size={16} />}</span>
                <div>
                  <div className="name">{row.name}</div>
                  {row.kind === "experiment" && <FolderMatch experiment={row.experiment} query={query} fallback={rowSubtitle(row.experiment, app.snap.blocks)} />}
                </div>
              </div>
              <span className="muted">{formatFolderTime(row.ts, app.now)}</span>
              <span className="muted">{row.kind === "folder" ? "—" : formatBytes(row.size)}</span>
              <button className="icon-btn" onClick={(event) => { event.stopPropagation(); setMenu({ ...anchorOf(event.currentTarget), kind: row.kind, id }); }} aria-label="更多">
                <MoreIcon />
              </button>
            </div>
          );
        })}
      </section>
      <Popover open={!!sortOpen} x={sortOpen?.x ?? 0} y={sortOpen?.y ?? 0} onClose={() => setSortOpen(null)} width={140}>
        {(["updated", "name", "size"] as SortKey[]).map((key) => (
          <button key={key} className="menu-item" onClick={() => { setSort(key); setSortOpen(null); }}>
            {key === "updated" ? "最近修改" : key === "name" ? "名称" : "大小"}
          </button>
        ))}
      </Popover>
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <button className="menu-item" onClick={() => {
          if (!menu) return;
          const value = menu.kind === "folder"
            ? app.snap.folders.find((item) => item.id === menu.id)?.name ?? ""
            : app.snap.experiments.find((item) => item.id === menu.id)?.title ?? "";
          setRename({ kind: menu.kind, id: menu.id, value });
          setMenu(null);
        }}><PencilIcon /> 重命名</button>
        {menu?.kind === "experiment" && (
          <button className="menu-item" onClick={() => { setMoveId(menu.id); setDest(null); setMenu(null); }}>
            <FolderIcon size={16} /> 移动到...
          </button>
        )}
        <button className="menu-item danger" onClick={() => {
          if (!menu) return;
          const name = menu.kind === "folder"
            ? app.snap.folders.find((item) => item.id === menu.id)?.name ?? ""
            : app.snap.experiments.find((item) => item.id === menu.id)?.title ?? "";
          setRemove({ kind: menu.kind, id: menu.id, name });
          setMenu(null);
        }}><TrashIcon /> 删除</button>
      </Popover>
      {rename && (
        <Modal title="重命名" onClose={() => setRename(null)}>
          <input className="text-input" autoFocus value={rename.value} onChange={(event) => setRename({ ...rename, value: event.target.value })} />
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
          <p className="confirm-copy">确定删除「{remove.name}」？已关联的原文件不会被删除。如果其中有已导入的副本，那些副本会从应用数据中删除。此操作无法撤销。</p>
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
      {moveId && (
        <Modal title="移动到..." onClose={() => setMoveId(null)}>
          <div className="move-list">
            {app.snap.folders.map((item) => (
              <button key={item.id} className={"move-item" + (dest === item.id ? " on" : "")} disabled={item.id === folder.id} onClick={() => setDest(item.id)}>
                <FolderIcon size={15} /> {item.name}
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn-soft" onClick={() => setMoveId(null)}>取消</button>
            <button className="btn-black" disabled={!dest} onClick={() => { if (dest) app.moveExperiment(moveId, dest); setMoveId(null); }}>移动</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FolderMatch({ experiment, query, fallback }: { experiment: Experiment; query: string; fallback: string }) {
  const app = useApp();
  const q = query.trim();
  if (!q || experiment.title.toLowerCase().includes(q.toLowerCase()) || experiment.subtitle.toLowerCase().includes(q.toLowerCase())) {
    return <div className="name-sub">{fallback}</div>;
  }
  const hit = searchNotebook(app.snap, q).find((item) => item.experimentId === experiment.id);
  if (!hit) return <div className="name-sub">{fallback}</div>;
  return <div className="name-sub"><Snippet text={hit.snippet} start={hit.matchStart} end={hit.matchEnd} /></div>;
}

function rowSubtitle(experiment: Experiment, blocks: { experimentId: string }[]): string {
  const hasBlocks = blocks.some((block) => block.experimentId === experiment.id);
  if (!hasBlocks && !experiment.subtitle.trim()) return "尚未添加内容";
  return experiment.subtitle.trim() || "实验文件";
}

export function Breadcrumb({ chain, current, extra }: { chain: Folder[]; current?: string; extra?: string }) {
  const app = useApp();
  const root = app.snap.folders.find((folder) => folder.parentId === null);
  return (
    <div className="crumbs">
      <button onClick={() => root && app.openFolder(root.id)}>文件</button>
      {chain.map((folder) => (
        <span key={folder.id}>
          <span className="sep">/</span>
          <button onClick={() => app.openFolder(folder.id)}>{folder.name}</button>
        </span>
      ))}
      {current && <span><span className="sep">/</span><span className="here">{current}</span></span>}
      {extra && <span><span className="sep">/</span><span className="here">{extra}</span></span>}
    </div>
  );
}
