import { formatFolderTime } from "../lib/format";
import { folderPath } from "../lib/tree";
import { useApp } from "../state/store";
import { DocIcon } from "./icons";

export function RecentsPage() {
  const app = useApp();
  const items = [...app.snap.recents].sort((a, b) => b.openedAt - a.openedAt);
  return (
    <div className="page">
      <div className="page-head">
        <div className="titles">
          <h1 className="page-title">最近</h1>
          <p className="count-line">{items.length} 条记录</p>
        </div>
      </div>
      <section className="card">
        {items.length === 0 && <p className="empty-line">还没有打开过实验文件</p>}
        {items.map((item) => {
          const experiment = app.snap.experiments.find((entry) => entry.id === item.experimentId);
          if (!experiment) return null;
          const path = folderPath(app.snap.folders, experiment.folderId).map((folder) => folder.name).join(" / ");
          return (
            <button key={item.experimentId} className="trow recent-row" onClick={() => app.openExperiment(experiment.id)}>
              <span className="file-badge"><DocIcon size={16} /></span>
              <span>
                <span className="name">{experiment.title}</span>
                <span className="name-sub">{path}</span>
              </span>
              <span className="muted">{formatFolderTime(item.openedAt, app.now)}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
