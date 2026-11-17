import { useEffect, useState } from "react";
import { folderPath } from "../lib/tree";
import { useApp } from "../state/store";
import { ClipIcon, DocIcon, GridIcon, PlusIcon, SavedIcon } from "./icons";
import { FilesBlock } from "./FilesBlock";
import { Breadcrumb } from "./FolderView";
import { PlateBlock } from "./PlateBlock";
import { TextBlock } from "./TextBlock";
import { Popover, anchorOf } from "./ui";

export function ExperimentView({ experimentId }: { experimentId: string }) {
  const app = useApp();
  const experiment = app.snap.experiments.find((item) => item.id === experimentId);
  const [editingSub, setEditingSub] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const blocks = app.snap.blocks.filter((block) => block.experimentId === experimentId).sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (app.focus?.experimentId !== experimentId || !app.focus.blockId) return;
    document.querySelector(`[data-block-id="${app.focus.blockId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [app.focus, experimentId]);

  if (!experiment) return <div className="page"><p className="muted">实验文件不存在</p></div>;
  const chain = folderPath(app.snap.folders, experiment.folderId).slice(1);

  return (
    <div className="page">
      <Breadcrumb chain={chain} extra={experiment.title} />
      <div className="page-head">
        <div className="titles">
          <input
            className="page-title"
            value={experiment.title}
            onChange={(event) => app.renameExperiment(experiment.id, event.target.value)}
            onBlur={() => { if (!experiment.title.trim()) app.renameExperiment(experiment.id, "未命名实验"); }}
          />
          <div className="sub">
            {editingSub ? (
              <input
                className="sub-input"
                autoFocus
                value={experiment.subtitle}
                placeholder="添加备注"
                onChange={(event) => app.setSubtitle(experiment.id, event.target.value)}
                onBlur={() => setEditingSub(false)}
                onKeyDown={(event) => { if (event.key === "Enter") setEditingSub(false); }}
              />
            ) : (
              <button className="sub-btn" onClick={() => setEditingSub(true)}>
                {experiment.subtitle.trim() || "实验文件"}
              </button>
            )}
            {experiment.subtitle.trim() ? <span className="save-gap" /> : <span className="dot">·</span>}
            <span>{app.saveState === "saving" ? "保存中…" : "已保存"}</span>
            {app.saveState === "saved" && <SavedIcon />}
          </div>
        </div>
        <button className="btn-black" onClick={(event) => setMenu(anchorOf(event.currentTarget))}>
          <PlusIcon size={15} /> 添加内容
        </button>
      </div>
      {blocks.length === 0 ? (
        <section className="card empty-card">
          <div
            className="empty-editor"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="写下记录，或添加一个内容块…"
            onInput={(event) => {
              const text = event.currentTarget.textContent?.trim() ?? "";
              if (!text) return;
              app.addBlock(experiment.id, "text", text);
            }}
          />
        </section>
      ) : (
        <div className="blocks">
          {blocks.map((block) => {
            if (block.kind === "plate") {
              return <PlateBlock key={block.id} block={block} onDelete={() => app.deleteBlock(block.id)} onMove={(direction) => app.moveBlock(block.id, direction)} />;
            }
            if (block.kind === "text") return <TextBlock key={block.id} block={block} onDelete={() => app.deleteBlock(block.id)} />;
            return <FilesBlock key={block.id} block={block} />;
          })}
        </div>
      )}
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)} width={248} className="menu add-menu">
        <button className="add-item" onClick={() => { app.addBlock(experiment.id, "plate"); setMenu(null); }}>
          <span className="add-ico plate"><GridIcon /></span>
          <span><b>孔板</b><small>记录孔位与板盖备注</small></span>
        </button>
        <button className="add-item" onClick={() => { app.addBlock(experiment.id, "text"); setMenu(null); }}>
          <span className="add-ico text"><DocIcon size={16} /></span>
          <span><b>文本</b><small>自由写下实验记录</small></span>
        </button>
        <button className="add-item" onClick={() => { app.addBlock(experiment.id, "files"); setMenu(null); }}>
          <span className="add-ico file"><ClipIcon /></span>
          <span><b>文件</b><small>保存实验结果附件</small></span>
        </button>
      </Popover>
    </div>
  );
}
