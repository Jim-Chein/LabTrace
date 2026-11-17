import { useMemo, useState } from "react";
import { formatGroupLabel, formatInputDateTime, formatTodoWhen, parseInputDateTime, startOfDay } from "../lib/format";
import { useApp } from "../state/store";
import { createId, type Todo } from "../types";
import { CalendarIcon, MoreIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons";
import { Popover, anchorOf } from "./ui";

type Mode = "open" | "done";

export function TodoPage() {
  const app = useApp();
  const [mode, setMode] = useState<Mode>("open");
  const [query, setQuery] = useState("");
  const [fileId, setFileId] = useState<string | "all">("all");
  const [filterOpen, setFilterOpen] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [editor, setEditor] = useState<{ todo: Todo; x: number; y: number; time: string } | null>(null);

  const openCount = app.snap.todos.filter((todo) => !todo.completed).length;
  const doneCount = app.snap.todos.filter((todo) => todo.completed).length;
  const fileLabel = fileId === "all" ? "全部实验文件" : app.snap.experiments.find((item) => item.id === fileId)?.title ?? "全部实验文件";

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = app.snap.todos.filter((todo) => {
      if (fileId !== "all" && todo.experimentId !== fileId) return false;
      if (q && !todo.content.toLowerCase().includes(q)) return false;
      return true;
    });
    if (mode === "done") {
      return [{ key: "done", label: "已完成", items: filtered.filter((todo) => todo.completed) }];
    }
    const pending = filtered.filter((todo) => !todo.completed);
    const buckets = new Map<string, Todo[]>();
    for (const todo of pending) {
      const key = todo.dueAt == null ? "none" : String(startOfDay(new Date(todo.dueAt)));
      buckets.set(key, [...(buckets.get(key) ?? []), todo]);
    }
    const ordered = [...buckets.entries()].sort((a, b) => Number(a[0] === "none" ? 9e15 : a[0]) - Number(b[0] === "none" ? 9e15 : b[0]));
    const result = ordered.map(([key, items]) => ({
      key,
      label: key === "none" ? "未安排" : formatGroupLabel(items[0].dueAt ?? Date.now(), app.now),
      items: items.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    }));
    const done = filtered.filter((todo) => todo.completed);
    if (done.length) result.push({ key: "done", label: "已完成", items: done });
    return result;
  }, [app.snap.todos, app.now, mode, query, fileId]);

  const openEditor = (todo: Todo, anchor: { x: number; y: number }) => {
    setEditor({
      todo,
      ...anchor,
      time: todo.dueAt ? formatInputDateTime(todo.dueAt) : "",
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="titles">
          <h1 className="page-title">待办</h1>
          <p className="count-line">{openCount} 个待完成 · {doneCount} 个已完成</p>
        </div>
        <button className="btn-black" onClick={(event) => {
          const due = new Date(app.now);
          due.setHours(18, 0, 0, 0);
          if (due.getTime() <= app.now.getTime()) due.setDate(due.getDate() + 1);
          const ts = Date.now();
          openEditor({
            id: createId(),
            content: "",
            dueAt: due.getTime(),
            completed: false,
            completedAt: null,
            experimentId: null,
            sourceLabel: "",
            sourceBlockId: null,
            sourceStyle: "record",
            tag: null,
            notified: false,
            createdAt: ts,
            updatedAt: ts,
          }, anchorOf(event.currentTarget));
        }}><PlusIcon size={15} /> 新建待办</button>
      </div>
      <div className="tool-row spread">
        <div className="segs">
          <button className={mode === "open" ? "seg on" : "seg"} onClick={() => setMode("open")}>待完成 {openCount}</button>
          <button className={mode === "done" ? "seg on" : "seg"} onClick={() => setMode("done")}>已完成 {doneCount}</button>
        </div>
        <div className="tool-right">
          <button className="pill" onClick={(event) => setFilterOpen(anchorOf(event.currentTarget))}>{fileLabel} ▾</button>
          <label className="pill-search">
            <SearchIcon />
            <input value={query} placeholder="搜索待办" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
      </div>
      <section className="card todo-card">
        {groups.every((group) => group.items.length === 0) && <p className="empty-line">没有待办</p>}
        {groups.map((group) => group.items.length === 0 ? null : (
          <div key={group.key} className="todo-group">
            <h3>{group.label}</h3>
            {group.items.map((todo) => {
              const experiment = app.snap.experiments.find((item) => item.id === todo.experimentId);
              return (
                <div key={todo.id} className={"todo-row" + (todo.completed ? " done" : "")}>
                  <button className={"check" + (todo.completed ? " on" : "")} onClick={() => app.toggleTodo(todo.id)} aria-label={todo.completed ? "标为未完成" : "标为完成"} />
                  <div className="todo-content">{todo.content}</div>
                  <div className="todo-source">
                    {experiment && todo.sourceStyle === "link" ? (
                      <button className="src-link" onClick={() => app.openExperiment(experiment.id, { blockId: todo.sourceBlockId ?? undefined })}>
                        {experiment.title} &gt; {todo.sourceLabel}
                      </button>
                    ) : experiment ? (
                      <button className="src-muted" onClick={() => app.openExperiment(experiment.id, { blockId: todo.sourceBlockId ?? undefined })}>
                        {experiment.title} · {/^[A-Za-z]/.test(todo.sourceLabel) ? `来自 ${todo.sourceLabel}` : `来自${todo.sourceLabel}`}
                      </button>
                    ) : <span className="src-muted">{todo.sourceLabel}</span>}
                    {todo.tag && <span className="tag">{todo.tag}</span>}
                  </div>
                  <span className="todo-time">{todo.completed ? "" : formatTodoWhen(todo.dueAt, app.now)}</span>
                  <button className="icon-btn" aria-label="更多" onClick={(event) => setMenu({ ...anchorOf(event.currentTarget), id: todo.id })}><MoreIcon /></button>
                </div>
              );
            })}
          </div>
        ))}
      </section>
      <Popover open={!!filterOpen} x={filterOpen?.x ?? 0} y={filterOpen?.y ?? 0} onClose={() => setFilterOpen(null)} width={200}>
        <button className="menu-item" onClick={() => { setFileId("all"); setFilterOpen(null); }}>全部实验文件</button>
        {app.snap.experiments.map((experiment) => (
          <button key={experiment.id} className="menu-item" onClick={() => { setFileId(experiment.id); setFilterOpen(null); }}>{experiment.title}</button>
        ))}
      </Popover>
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <button className="menu-item" onClick={() => {
          const todo = app.snap.todos.find((item) => item.id === menu?.id);
          if (todo && menu) openEditor(todo, menu);
          setMenu(null);
        }}>编辑</button>
        <button className="menu-item danger" onClick={() => { if (menu) app.deleteTodo(menu.id); setMenu(null); }}><TrashIcon /> 删除</button>
      </Popover>
      {editor && (
        <Popover open x={editor.x} y={editor.y} onClose={() => setEditor(null)} className="menu editor-pop" width={300}>
          <div className="pop-title">{app.snap.todos.some((todo) => todo.id === editor.todo.id) ? "编辑待办" : "新建待办"}</div>
          <label className="field">内容
            <input value={editor.todo.content} onChange={(event) => setEditor({ ...editor, todo: { ...editor.todo, content: event.target.value } })} />
          </label>
          <label className="field">时间
            <span className="time-input">
              <input value={editor.time} placeholder="2026/09/09 14:00" onChange={(event) => setEditor({ ...editor, time: event.target.value })} />
              <CalendarIcon />
            </span>
          </label>
          <label className="field">来源
            <select
              value={sourceValue(editor.todo)}
              onChange={(event) => setEditor({ ...editor, todo: applySource(editor.todo, event.target.value, app.snap) })}
            >
              <option value="">无</option>
              {app.snap.experiments.map((experiment) => (
                <option key={experiment.id} value={`record:${experiment.id}:实验记录`}>{experiment.title} · 来自实验记录</option>
              ))}
              {app.snap.blocks.filter((block) => block.kind === "plate").map((block) => {
                if (block.kind !== "plate") return null;
                const experiment = app.snap.experiments.find((item) => item.id === block.experimentId);
                if (!experiment) return null;
                return <option key={block.id} value={`link:${block.id}`}>{experiment.title} · {block.plate.title}</option>;
              })}
            </select>
          </label>
          <div className="modal-actions">
            <button className="btn-black" onClick={() => {
              const content = editor.todo.content.trim();
              if (!content) return;
              const dueAt = editor.time.trim() ? parseInputDateTime(editor.time) : null;
              if (editor.time.trim() && dueAt == null) return;
              app.saveTodo({ ...editor.todo, content, dueAt, updatedAt: Date.now() });
              setEditor(null);
            }}>保存</button>
            <button className="btn-soft" onClick={() => setEditor(null)}>取消</button>
          </div>
        </Popover>
      )}
    </div>
  );
}

function sourceValue(todo: Todo): string {
  if (todo.sourceStyle === "link" && todo.sourceBlockId) return `link:${todo.sourceBlockId}`;
  if (todo.experimentId && todo.sourceLabel) return `record:${todo.experimentId}:${todo.sourceLabel}`;
  return "";
}

function applySource(todo: Todo, value: string, snap: { experiments: { id: string; title: string }[]; blocks: { id: string; kind: string; experimentId: string; plate?: { title: string } }[] }): Todo {
  if (!value) return { ...todo, experimentId: null, sourceBlockId: null, sourceLabel: "", sourceStyle: "record" };
  if (value.startsWith("link:")) {
    const blockId = value.slice(5);
    const block = snap.blocks.find((item) => item.id === blockId);
    return {
      ...todo,
      sourceStyle: "link",
      sourceBlockId: blockId,
      experimentId: block?.experimentId ?? null,
      sourceLabel: block?.plate?.title ?? "Plate",
    };
  }
  const [, experimentId, label] = value.split(":");
  return { ...todo, sourceStyle: "record", experimentId: experimentId ?? null, sourceBlockId: null, sourceLabel: label ?? "实验记录" };
}
