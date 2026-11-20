import { useEffect, useRef, useState } from "react";
import { isTauri } from "../lib/env";
import { formatBytes, formatFileTime } from "../lib/format";
import { inspectLocalPath, revealLabel } from "../lib/localPath";
import { useApp } from "../state/store";
import type { Attachment, Block } from "../types";
import { FileTypeIcon, MoreIcon, TrashIcon, UploadIcon } from "./icons";
import { Popover, anchorOf } from "./ui";

interface Probe {
  state: "ok" | "missing" | "error";
  size?: number;
  modifiedMs?: number;
}

export function FilesBlock({ block }: { block: Extract<Block, { kind: "files" }> }) {
  const app = useApp();
  const cardRef = useRef<HTMLElement>(null);
  const hotRef = useRef(false);
  const [hot, setHot] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [probe, setProbe] = useState<Record<string, Probe>>({});
  const experiment = app.snap.experiments.find((item) => item.id === block.experimentId);
  const files = app.snap.attachments.filter((item) => item.blockId === block.id).sort((a, b) => a.updatedAt - b.updatedAt);
  const paths = files.map((file) => file.sourcePath ?? "").join("\n");
  const linkRef = useRef(app.linkFile);
  linkRef.current = app.linkFile;

  useEffect(() => {
    if (!isTauri()) return;
    let stop = false;
    const refresh = () => {
      const linked = files.filter((file) => file.sourcePath);
      if (!linked.length) return;
      void (async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        const next: Record<string, Probe> = {};
        await Promise.all(linked.map(async (file) => {
          const path = file.sourcePath;
          if (!path) return;
          try {
            const info = await invoke<{ exists: boolean; isFile: boolean; size: number; modifiedMs: number }>("local_file_status", { path });
            if (!info.exists) next[file.id] = { state: "missing" };
            else if (!info.isFile) next[file.id] = { state: "error" };
            else next[file.id] = { state: "ok", size: info.size, modifiedMs: info.modifiedMs };
          } catch {
            next[file.id] = { state: "error" };
          }
        }));
        if (!stop) setProbe(next);
      })();
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      stop = true;
      window.removeEventListener("focus", refresh);
    };
  }, [paths]);

  useEffect(() => {
    if (!isTauri() || !experiment) return;
    let unlisten: (() => void) | undefined;
    let cancel = false;
    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "leave") {
          hotRef.current = false;
          setHot(false);
          return;
        }
        if (event.payload.type !== "drop" && event.payload.type !== "enter" && event.payload.type !== "over") return;
        const position = "position" in event.payload ? event.payload.position : undefined;
        const card = cardRef.current;
        const over = card && position ? hitsCard(card, position.x, position.y) : hotRef.current;
        if (event.payload.type !== "drop") {
          hotRef.current = over;
          setHot(over);
          return;
        }
        hotRef.current = false;
        setHot(false);
        if (!over || !("paths" in event.payload)) return;
        for (const path of event.payload.paths) void linkRef.current(experiment.id, block.id, path);
      });
      if (cancel) stop();
      else unlisten = stop;
    })();
    return () => {
      cancel = true;
      unlisten?.();
    };
  }, [block.id, experiment?.id]);

  const choose = async () => {
    if (!experiment) return;
    if (!isTauri()) {
      app.notify("浏览器预览不能取得本机路径，请使用桌面版");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, directory: false, title: "选择结果文件" });
    if (!picked) return;
    const list = Array.isArray(picked) ? picked : [picked];
    for (const path of list) {
      if (typeof path === "string") await app.linkFile(experiment.id, block.id, path);
    }
  };

  const openOriginal = async (file: Attachment) => {
    if (!file.sourcePath) {
      app.notify("这是已导入副本，没有原文件路径。请重新选择原文件。");
      return;
    }
    const checked = inspectLocalPath(file.sourcePath);
    if (!checked.ok) {
      app.notify("路径无效。请重新选择原文件。");
      return;
    }
    if (!isTauri()) {
      app.notify("浏览器预览不能打开本机文件");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_local_file", { path: checked.path });
    } catch (error) {
      app.notify(openFailure(error));
    }
  };

  const reveal = async (file: Attachment) => {
    if (!file.sourcePath) return;
    const checked = inspectLocalPath(file.sourcePath);
    if (!checked.ok) {
      app.notify("路径无效。请重新选择原文件。");
      return;
    }
    if (!isTauri()) {
      app.notify("浏览器预览不能打开文件管理器");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reveal_local_file", { path: checked.path });
    } catch (error) {
      app.notify(openFailure(error));
    }
  };

  const relink = async (id: string) => {
    if (!isTauri()) {
      app.notify("浏览器预览不能取得本机路径，请使用桌面版");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, directory: false, title: "重新选择原文件" });
    if (typeof picked === "string") await app.relinkFile(id, picked);
  };

  const menuFile = files.find((file) => file.id === menu?.id);

  return (
    <section
      className={"card" + (hot ? " hot" : "")}
      data-block-id={block.id}
      ref={cardRef}
      onDragOver={(event) => {
        event.preventDefault();
        hotRef.current = true;
        setHot(true);
      }}
      onDragLeave={() => {
        hotRef.current = false;
        setHot(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        hotRef.current = false;
        setHot(false);
        if (!isTauri()) app.notify("浏览器预览不能取得本机路径，请使用桌面版");
      }}
    >
      <div className="card-title-row">
        <div>
          <h3>结果文件 <span className="count-pill">{files.length}</span></h3>
          <p className="file-hint">双击用系统默认程序打开原文件。文件移动或卸载后需重新选择，这里不会自动跟踪，也不会读取文件内容。</p>
        </div>
        <button className="btn-soft" onClick={() => void choose()}><UploadIcon /> 选择本机文件</button>
      </div>
      <div className="thead file-cols"><span>文件名</span><span>大小</span><span>修改时间</span><span /></div>
      {files.map((file) => {
        const status = probe[file.id];
        const size = status?.state === "ok" && status.size !== undefined ? status.size : file.size;
        const when = status?.state === "ok" && status.modifiedMs ? status.modifiedMs : file.updatedAt;
        return (
          <div
            key={file.id}
            className="trow file-cols"
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              void openOriginal(file);
            }}
          >
            <div className="name-cell">
              <FileTypeIcon name={file.filename} />
              <div className="name-block">
                <div className="name">
                  {file.filename}
                  {!file.sourcePath && <span className="ref-tag">已导入副本</span>}
                </div>
                {file.sourcePath ? (
                  <div className="file-path" title={file.sourcePath}>{file.sourcePath}</div>
                ) : (
                  <div className="file-path">没有原文件路径</div>
                )}
                {file.sourcePath && status?.state === "missing" && <div className="file-path missing">原文件缺失，可能已移动或未挂载</div>}
                {file.sourcePath && status?.state === "error" && <div className="file-path missing">无法访问该路径</div>}
              </div>
            </div>
            <span className="muted">{formatBytes(size)}</span>
            <span className="muted">{formatFileTime(when, app.now)}</span>
            <div className="file-actions">
              {file.sourcePath && (
                <button type="button" onClick={() => void reveal(file)}>{revealLabel(file.sourcePath)}</button>
              )}
              <button type="button" onClick={() => void relink(file.id)}>重新选择</button>
              <button type="button" className="icon-btn" onClick={(event) => setMenu({ ...anchorOf(event.currentTarget), id: file.id })} aria-label="更多"><MoreIcon /></button>
            </div>
          </div>
        );
      })}
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <button className="menu-item danger" onClick={() => { if (menu) void app.deleteAttachment(menu.id); setMenu(null); }}>
          <TrashIcon /> 移除引用
        </button>
        <p className="menu-note">
          {menuFile?.storedName
            ? "会删除应用内的已导入副本，不会删除你电脑上的原文件。"
            : "只从记录中移除路径，不会删除原文件。"}
        </p>
      </Popover>
    </section>
  );
}

function hitsCard(card: HTMLElement, x: number, y: number): boolean {
  const rect = card.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const inCss = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const inPhysical = x >= rect.left * scale && x <= rect.right * scale && y >= rect.top * scale && y <= rect.bottom * scale;
  return inCss || inPhysical;
}

function openFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("missing")) return "原文件不存在，可能已移动或未挂载。请重新选择。";
  if (text.includes("not a file")) return "这个路径不是文件。";
  if (text.includes("invalid path")) return "路径无效。请重新选择原文件。";
  return "无法用系统默认程序打开。";
}
