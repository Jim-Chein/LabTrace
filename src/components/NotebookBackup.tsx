import { useEffect, useState } from "react";
import { isTauri } from "../lib/env";
import { useApp } from "../state/store";
import { Modal } from "./ui";

interface BackupInfo {
  version: number;
  attachmentCount: number;
  includesExternalFiles: boolean;
}

export function NotebookBackup({ mode, onClose }: { mode: "export" | "restore" | null; onClose: () => void }) {
  const app = useApp();
  const [archive, setArchive] = useState<string | null>(null);
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setArchive(null);
    setInfo(null);
  }, [mode]);

  const close = () => {
    if (busy) return;
    setArchive(null);
    setInfo(null);
    onClose();
  };

  const chooseExport = async () => {
    if (!isTauri()) {
      app.notify("请使用桌面版备份笔记本");
      return;
    }
    const { save } = await import("@tauri-apps/plugin-dialog");
    const dest = await save({
      title: "备份笔记本",
      defaultPath: "LabTrace-backup.zip",
      filters: [{ name: "LabTrace 备份", extensions: ["zip"] }],
    });
    if (typeof dest !== "string") return;
    setBusy(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("export_notebook", { dest });
      app.notify("备份已保存。已关联的原文件没有放进备份。");
      setArchive(null);
      setInfo(null);
      onClose();
    } catch (error) {
      app.notify(backupMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseRestore = async () => {
    if (!isTauri()) {
      app.notify("请使用桌面版恢复笔记本");
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      title: "选择备份",
      multiple: false,
      directory: false,
      filters: [{ name: "LabTrace 备份", extensions: ["zip"] }],
    });
    if (typeof picked !== "string") return;
    setBusy(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const preview = await invoke<BackupInfo>("inspect_notebook_backup", { archive: picked });
      setArchive(picked);
      setInfo(preview);
    } catch (error) {
      app.notify(backupMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!archive) return;
    setBusy(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("restore_notebook", { archive });
      await app.reloadNotebook();
      app.notify("已恢复笔记本。原文件若路径不存在，可以重新选择。");
      setArchive(null);
      setInfo(null);
      onClose();
    } catch (error) {
      await app.reloadNotebook();
      app.notify(backupMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!mode) return null;
  return (
    <>
      {mode === "export" && (
        <Modal title="备份笔记本" onClose={close}>
          <p className="confirm-copy">备份会保存笔记本数据库，以及以前导入到应用里的文件副本。已经关联的原文件不会复制进备份。把备份拿到另一台电脑后，如果原路径不存在，记录会显示缺失，可以重新选择原文件。</p>
          <div className="modal-actions">
            <button className="btn-soft" onClick={close} disabled={busy}>取消</button>
            <button className="btn-black" onClick={() => void chooseExport()} disabled={busy}>选择保存位置</button>
          </div>
        </Modal>
      )}
      {mode === "restore" && (
        <Modal title="恢复笔记本" onClose={close}>
          <p className="confirm-copy">恢复会用备份替换当前笔记本。开始前会先把当前笔记本存成一份恢复副本；如果恢复中断或失败，会用这份副本回到恢复前。备份里没有原文件，恢复后这些路径可能缺失，可以重新选择。已导入的副本会随备份一起恢复。</p>
          {info && <p className="confirm-copy">这份备份包含 {info.attachmentCount} 个已导入副本。原文件不在备份中。</p>}
          <div className="modal-actions">
            <button className="btn-soft" onClick={close} disabled={busy}>取消</button>
            {!info && <button className="btn-black" onClick={() => void chooseRestore()} disabled={busy}>选择备份文件</button>}
            {info && <button className="btn-danger" onClick={() => void confirmRestore()} disabled={busy}>确认替换</button>}
          </div>
        </Modal>
      )}
    </>
  );
}

function backupMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("unsupported-version")) return "无法恢复：备份版本不受支持。当前笔记本没有改动。";
  if (text.includes("invalid-format")) return "无法读取这份备份。当前笔记本没有改动。";
  if (text.includes("path-escape") || text.includes("symlink")) return "备份里的路径不安全，已拒绝。当前笔记本没有改动。";
  if (text.includes("too-large")) return "备份超出大小限制。当前笔记本没有改动。";
  if (text.includes("external-not-allowed")) return "这份备份包含原文件数据，当前版本不会恢复它。";
  if (text.includes("rollback-failed:")) return `恢复没有完成，自动回滚也失败了。恢复副本仍在：${text.split("rollback-failed:")[1] ?? ""}`;
  if (text.includes("forced-failure")) return "恢复没有完成，已回到恢复前的笔记本。";
  return "备份或恢复没有完成。";
}
