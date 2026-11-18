import { useState } from "react";
import { ExperimentView } from "./components/ExperimentView";
import { FolderView } from "./components/FolderView";
import { ClockIcon, CloseIcon, DocIcon, FolderIcon, Logo, PlusIcon } from "./components/icons";
import { RecentsPage } from "./components/RecentsPage";
import { Sidebar } from "./components/Sidebar";
import { Popover, anchorOf } from "./components/ui";
import { useApp } from "./state/store";

export function App() {
  const app = useApp();
  const [avatar, setAvatar] = useState<{ x: number; y: number } | null>(null);
  if (!app.ready) return <div className="boot">正在打开 LabTrace…</div>;
  const tab = app.activeTab;
  const rail = tab.kind === "recent" ? "recent" : "files";

  return (
    <div className="app">
      <nav className="rail">
        <Logo />
        <button className={"rail-btn" + (rail === "files" ? " on" : "")} onClick={() => app.showFiles()}>
          <span className="rail-ico"><DocIcon /></span>
          <span>文件</span>
        </button>
        <button className={"rail-btn" + (rail === "recent" ? " on" : "")} onClick={() => app.openRecent()}>
          <span className="rail-ico"><ClockIcon /></span>
          <span>最近</span>
        </button>
      </nav>
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div className="tabs">
            {app.tabs.map((item) => (
              <button key={item.id} className={"tab" + (item.id === tab.id ? " on" : "")} onClick={() => app.setActiveTab(item.id)}>
                {item.kind === "recent" ? <ClockIcon size={14} /> : item.kind === "folder" ? <FolderIcon size={14} /> : <DocIcon size={14} />}
                <span>{tabTitle(item.kind, item.targetId, app.snap)}</span>
                <span className="tab-x" onClick={(event) => { event.stopPropagation(); app.closeTab(item.id); }}><CloseIcon /></span>
              </button>
            ))}
            <button className="tab-plus" onClick={() => app.newTab()} aria-label="新标签"><PlusIcon size={16} /></button>
          </div>
          <button className="avatar" onClick={(event) => setAvatar(anchorOf(event.currentTarget))}>ZL</button>
        </header>
        <div className="content">
          {tab.kind === "folder" && tab.targetId && <FolderView folderId={tab.targetId} />}
          {tab.kind === "experiment" && tab.targetId && <ExperimentView experimentId={tab.targetId} />}
          {tab.kind === "recent" && <RecentsPage />}
        </div>
      </main>
      <Popover open={!!avatar} x={avatar?.x ?? 0} y={avatar?.y ?? 0} onClose={() => setAvatar(null)} className="menu avatar-pop" width={240}>
        <div className="pop-title">LabTrace</div>
        <p className="pop-sub">版本 0.1.0</p>
        <button className="menu-item" onClick={() => void app.checkUpdates()}>检查更新</button>
        {app.updateOffer && <button className="menu-item" onClick={() => void app.updateOffer?.install()}>安装 {app.updateOffer.version}</button>}
        {app.toast && <p className="pop-sub">{app.toast}</p>}
      </Popover>
    </div>
  );
}

function tabTitle(kind: string, targetId: string | undefined, snap: { folders: { id: string; name: string }[]; experiments: { id: string; title: string }[] }): string {
  if (kind === "recent") return "最近";
  if (kind === "folder") return snap.folders.find((folder) => folder.id === targetId)?.name ?? "文件夹";
  return snap.experiments.find((experiment) => experiment.id === targetId)?.title ?? "实验";
}
