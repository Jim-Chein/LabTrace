import { useState } from "react";
import { formatBytes, formatFileTime } from "../lib/format";
import { useApp } from "../state/store";
import type { Block } from "../types";
import { DownloadIcon, FileTypeIcon, MoreIcon, TrashIcon, UploadIcon } from "./icons";
import { Popover, anchorOf } from "./ui";
import { UploadModal } from "./UploadModal";

export function FilesBlock({ block }: { block: Extract<Block, { kind: "files" }> }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const experiment = app.snap.experiments.find((item) => item.id === block.experimentId);
  const files = app.snap.attachments.filter((item) => item.blockId === block.id).sort((a, b) => a.updatedAt - b.updatedAt);
  return (
    <section className="card" data-block-id={block.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); setOpen(true); }}
    >
      <div className="card-title-row">
        <h3>结果文件 <span className="count-pill">{files.length}</span></h3>
        <button className="btn-soft" onClick={() => setOpen(true)}><UploadIcon /> 上传文件</button>
      </div>
      <div className="thead file-cols"><span>文件名</span><span>大小</span><span>修改时间</span><span /><span /></div>
      {files.map((file) => (
        <div key={file.id} className="trow file-cols">
          <div className="name-cell">
            <FileTypeIcon name={file.filename} />
            <div className="name">{file.filename}</div>
          </div>
          <span className="muted">{formatBytes(file.size)}</span>
          <span className="muted">{formatFileTime(file.updatedAt, app.now)}</span>
          <button className="download" onClick={() => void app.exportAttachment(file.id)}><DownloadIcon /> 下载</button>
          <button className="icon-btn" onClick={(event) => setMenu({ ...anchorOf(event.currentTarget), id: file.id })} aria-label="更多"><MoreIcon /></button>
        </div>
      ))}
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <button className="menu-item danger" onClick={() => { if (menu) void app.deleteAttachment(menu.id); setMenu(null); }}>
          <TrashIcon /> 删除
        </button>
      </Popover>
      {open && experiment && (
        <UploadModal experimentId={experiment.id} blockId={block.id} title={experiment.title} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
