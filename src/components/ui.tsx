import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClockIcon } from "./icons";

export function Popover({
  open,
  x,
  y,
  onClose,
  children,
  className = "menu",
  width = 188,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  if (!open) return null;
  const left = Math.max(8, Math.min(x - width, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 16));
  return createPortal(
    <div ref={ref} className={className} style={{ left, top, width }}>
      {children}
    </div>,
    document.body,
  );
}

export function anchorOf(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.right, y: rect.bottom + 8 };
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function SuggestionCard({
  when,
  content,
  onAdd,
  onIgnore,
}: {
  when: string;
  content: string;
  onAdd: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="suggest">
      <div className="suggest-title"><ClockIcon size={16} /> 发现未来时间</div>
      <div className="suggest-actions">
        <button className="btn-black sm" onClick={onAdd}>加入待办</button>
        <button className="btn-text" onClick={onIgnore}>忽略</button>
      </div>
      <div className="suggest-sub">{when} · {content}</div>
    </div>
  );
}
