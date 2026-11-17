import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../state/store";
import { createId, type Attachment } from "../types";
import { CloseIcon, CloudIcon, FileTypeIcon } from "./icons";
import { formatBytes } from "../lib/format";

interface Job {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  attachmentId?: string;
}

export function UploadModal({
  experimentId,
  blockId,
  title,
  onClose,
}: {
  experimentId: string;
  blockId: string;
  title: string;
  onClose: () => void;
}) {
  const app = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [hot, setHot] = useState(false);
  const abort = useRef(false);
  const busy = jobs.some((job) => job.status === "uploading");

  const update = (id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  };

  const start = (files: File[]) => {
    abort.current = false;
    for (const file of files) {
      const id = createId();
      const job: Job = { id, file, progress: 8, status: "uploading" };
      setJobs((prev) => [...prev, job]);
      void run(job);
    }
  };

  const run = async (job: Job) => {
    try {
      const bytes = await readFile(job.file, (progress) => update(job.id, { progress }));
      if (abort.current) {
        update(job.id, { status: "error", progress: 0 });
        return;
      }
      update(job.id, { progress: 92 });
      const attachment: Attachment = {
        id: createId(),
        experimentId,
        blockId,
        filename: job.file.name,
        storedName: `${createId()}-${safe(job.file.name)}`,
        size: job.file.size,
        updatedAt: Date.now(),
      };
      await app.addAttachment(attachment, bytes);
      update(job.id, { progress: 100, status: "done", attachmentId: attachment.id });
    } catch {
      update(job.id, { status: "error" });
    }
  };

  const cancel = async () => {
    abort.current = true;
    const done = jobs.filter((job) => job.status === "done" && job.attachmentId);
    for (const job of done) {
      if (job.attachmentId) await app.deleteAttachment(job.attachmentId);
    }
    onClose();
  };

  return createPortal(
    <div className="overlay" onMouseDown={cancel}>
      <div className="modal upload-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-head">
          <div>
            <h3>上传结果文件</h3>
            <p className="modal-sub">保存到 {title}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><CloseIcon /></button>
        </div>
        <div
          className={"drop" + (hot ? " hot" : "")}
          onDragOver={(event) => { event.preventDefault(); setHot(true); }}
          onDragLeave={() => setHot(false)}
          onDrop={(event) => {
            event.preventDefault();
            setHot(false);
            start([...event.dataTransfer.files]);
          }}
        >
          <CloudIcon />
          <p className="drop-title">拖动文件到这里，或选择文件</p>
          <button className="btn-black" onClick={() => input.current?.click()}>选择文件</button>
          <p className="drop-hint">支持 Excel、Prism、Origin 等原始文件</p>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              start([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </div>
        <div className="jobs">
          {jobs.map((job) => (
            <div key={job.id} className="job">
              <FileTypeIcon name={job.file.name} />
              <div className="job-main">
                <div className="job-name">{job.file.name} <span>{formatBytes(job.file.size)}</span></div>
                {job.status === "uploading" && (
                  <div className="bar"><i style={{ width: `${job.progress}%` }} /></div>
                )}
              </div>
              {job.status === "done" && <span className="ok">✓ 上传完成</span>}
              {job.status === "uploading" && <span className="uploading">正在上传 {job.progress}%</span>}
              {job.status === "error" && <span className="danger-text">未完成</span>}
              {job.status === "uploading" && (
                <button className="icon-btn" onClick={() => { abort.current = true; update(job.id, { status: "error" }); }} aria-label="取消上传">×</button>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-soft" onClick={() => void cancel()}>取消</button>
          <button className="btn-soft primary-wait" disabled={busy || jobs.length === 0} onClick={onClose}>完成</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function safe(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-40);
  return cleaned || "file";
}

async function readFile(file: File, onProgress: (value: number) => void): Promise<Uint8Array> {
  const total = file.size || 1;
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onProgress(Math.min(85, Math.round((got / total) * 85)));
  }
  const bytes = new Uint8Array(got);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
