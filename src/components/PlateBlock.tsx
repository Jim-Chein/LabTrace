import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatWellRange, parseWell, plateSizeLabel, PLATE_SIZES, rectBetween, resizePlate, wellName } from "../lib/plate";
import { useApp } from "../state/store";
import type { Block } from "../types";
import { ChevronIcon, MoreIcon, PencilIcon, TrashIcon } from "./icons";
import { Popover, anchorOf } from "./ui";

export function PlateBlock({
  block,
  onDelete,
  onMove,
}: {
  block: Extract<Block, { kind: "plate" }>;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const app = useApp();
  const plate = block.plate;
  const [selected, setSelected] = useState<string[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [draftGroup, setDraftGroup] = useState<string | null | undefined>(undefined);
  const [editingLid, setEditingLid] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [sizeMenu, setSizeMenu] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<string | null>(null);

  useEffect(() => {
    if (!selected.length) return;
    const marks = selected.map((id) => plate.wells[id] ?? {});
    const notes = new Set(marks.map((mark) => mark.note ?? ""));
    setDraftNote(notes.size === 1 ? [...notes][0] : "");
    setDraftGroup(undefined);
  }, [selected.join("|")]);

  const well = plate.cols >= 12 ? 28 : plate.cols >= 8 ? 34 : 44;
  const band = selectionBand(selected);

  const colorOf = (id: string) => {
    const groupId = selected.includes(id) && draftGroup !== undefined ? draftGroup ?? undefined : plate.wells[id]?.groupId;
    return plate.groups.find((group) => group.id === groupId)?.color;
  };
  const shownGroup = (() => {
    if (draftGroup !== undefined) return draftGroup;
    const ids = new Set(selected.map((id) => plate.wells[id]?.groupId ?? ""));
    return ids.size === 1 ? [...ids][0] || null : null;
  })();

  const saveMark = () => {
    app.updateBlock(block.id, (item) => {
      if (item.kind !== "plate") return;
      for (const id of selected) {
        const prev = item.plate.wells[id] ?? {};
        const groupId = draftGroup === undefined ? prev.groupId : draftGroup || undefined;
        const note = draftNote.trim();
        if (!groupId && !note) delete item.plate.wells[id];
        else item.plate.wells[id] = { ...(groupId ? { groupId } : {}), ...(note ? { note } : {}) };
      }
    });
  };
  const clearMark = () => {
    app.updateBlock(block.id, (item) => {
      if (item.kind !== "plate") return;
      for (const id of selected) delete item.plate.wells[id];
    });
    setDraftNote("");
    setDraftGroup(null);
  };

  const onPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const id = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest("[data-well]")?.getAttribute("data-well");
    if (!id) return id;
    return id;
  };

  return (
    <div data-block-id={block.id}>
      <div className="split">
        <section className="card plate-card">
          <div className="plate-head">
            <input
              className="plate-title"
              value={plate.title}
              onChange={(event) => app.updateBlock(block.id, (item) => { if (item.kind === "plate") item.plate.title = event.target.value; })}
            />
            <button className="pill sm" onClick={(event) => setSizeMenu(anchorOf(event.currentTarget))}>
              {plateSizeLabel(plate.rows, plate.cols)} <ChevronIcon size={12} />
            </button>
            <button className="icon-btn" onClick={(event) => setMenu(anchorOf(event.currentTarget))} aria-label="孔板菜单"><MoreIcon /></button>
          </div>
          <div
            className="plate-grid"
            style={{
              gridTemplateColumns: `26px repeat(${plate.cols}, ${well}px)`,
              gridTemplateRows: `18px repeat(${plate.rows}, ${well}px)`,
            }}
            onPointerDown={(event) => {
              const id = onPointer(event);
              if (!id) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = id;
              setSelected(event.shiftKey && selected.length ? rectBetween(selected[0], id) : [id]);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const id = onPointer(event);
              if (id) setSelected(rectBetween(drag.current, id));
            }}
            onPointerUp={() => { drag.current = null; }}
          >
            <span style={{ gridColumn: 1, gridRow: 1 }} />
            {Array.from({ length: plate.cols }, (_, col) => (
              <span key={`c${col}`} className="axis" style={{ gridColumn: col + 2, gridRow: 1 }}>{col + 1}</span>
            ))}
            {Array.from({ length: plate.rows }, (_, row) => (
              <Fragment key={row}>
                <span className="axis" style={{ gridColumn: 1, gridRow: row + 2 }}>{String.fromCharCode(65 + row)}</span>
                {Array.from({ length: plate.cols }, (_, col) => {
                  const id = wellName(row, col);
                  const color = colorOf(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      data-well={id}
                      className="well"
                      style={{ gridColumn: col + 2, gridRow: row + 2, background: color ?? "#fff", borderColor: color ? "transparent" : "#E6E4EE" }}
                    >
                      {id}
                    </button>
                  );
                })}
              </Fragment>
            ))}
            {band && (
              <div
                className="band"
                style={{
                  gridColumn: `${band.c1 + 2} / span ${band.c2 - band.c1 + 1}`,
                  gridRow: `${band.r1 + 2} / span ${band.r2 - band.r1 + 1}`,
                  borderRadius: band.r1 === band.r2 ? 999 : 16,
                }}
              />
            )}
          </div>
          <div className="legend">
            {plate.groups.map((group) => (
              <label key={group.id} className="legend-item">
                <i style={{ background: group.color }} />
                <input
                  value={group.name}
                  onChange={(event) => app.updateBlock(block.id, (item) => {
                    if (item.kind !== "plate") return;
                    const target = item.plate.groups.find((entry) => entry.id === group.id);
                    if (target) target.name = event.target.value;
                  })}
                />
              </label>
            ))}
          </div>
        </section>
        {selected.length > 0 ? (
          <section className="card notes-card">
            <h3>孔位备注</h3>
            <div className="chip">{formatWellRange(selected)}</div>
            <textarea className="note-area" value={draftNote} onChange={(event) => setDraftNote(event.target.value)} />
            <div className="swatch-row">
              <div className="swatches">
                {plate.groups.map((group) => (
                  <button
                    key={group.id}
                    className={"swatch" + (shownGroup === group.id ? " on" : "")}
                    style={{ background: group.color, ["--swatch" as string]: group.color }}
                    onClick={() => setDraftGroup(group.id)}
                    aria-label={group.name}
                  />
                ))}
              </div>
              <button className="btn-text" onClick={clearMark}><TrashIcon /> 清除标记</button>
            </div>
            <div className="note-actions">
              <button className="btn-black" onClick={saveMark}>保存标记</button>
              <button className="btn-text" onClick={() => setSelected([])}>取消</button>
            </div>
          </section>
        ) : (
          <section className="card notes-card">
            <div className="card-title-row">
              <h3>板盖备注</h3>
              <button className="icon-btn" onClick={() => setEditingLid(true)} aria-label="编辑板盖备注"><PencilIcon /></button>
            </div>
            {editingLid ? (
              <textarea
                className="lid-edit"
                autoFocus
                value={plate.lidNotes}
                onChange={(event) => app.updateBlock(block.id, (item) => { if (item.kind === "plate") item.plate.lidNotes = event.target.value; })}
                onBlur={() => setEditingLid(false)}
              />
            ) : (
              <pre className="lid-text" onClick={() => setEditingLid(true)}>{plate.lidNotes || "记录细胞、铺板和加药时间"}</pre>
            )}
          </section>
        )}
      </div>
      {selected.length > 0 && (
        <section className="card lid-compact">
          <div className="card-title-row">
            <h3>板盖备注</h3>
            <button className="icon-btn" onClick={() => setEditingLid((value) => !value)} aria-label="编辑板盖备注"><PencilIcon /></button>
          </div>
          {editingLid ? (
            <textarea
              className="lid-edit"
              value={plate.lidNotes}
              onChange={(event) => app.updateBlock(block.id, (item) => { if (item.kind === "plate") item.plate.lidNotes = event.target.value; })}
            />
          ) : (
            <p className="lid-flow">{plate.lidNotes.split("\n").filter(Boolean).join(" · ")}</p>
          )}
        </section>
      )}
      <Popover open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <button className="menu-item" onClick={() => { onMove(-1); setMenu(null); }}>上移</button>
        <button className="menu-item" onClick={() => { onMove(1); setMenu(null); }}>下移</button>
        <button className="menu-item danger" onClick={() => { onDelete(); setMenu(null); }}>删除</button>
      </Popover>
      <Popover open={!!sizeMenu} x={sizeMenu?.x ?? 0} y={sizeMenu?.y ?? 0} onClose={() => setSizeMenu(null)} width={120}>
        {PLATE_SIZES.map((size) => (
          <button key={size.label} className="menu-item" onClick={() => {
            app.updateBlock(block.id, (item) => {
              if (item.kind === "plate") item.plate = resizePlate(item.plate, size.rows, size.cols);
            });
            setSizeMenu(null);
          }}>{size.label}</button>
        ))}
      </Popover>
    </div>
  );
}

function selectionBand(ids: string[]): { r1: number; r2: number; c1: number; c2: number } | null {
  if (!ids.length) return null;
  const parsed = ids.map(parseWell);
  return {
    r1: Math.min(...parsed.map((item) => item.r)),
    r2: Math.max(...parsed.map((item) => item.r)),
    c1: Math.min(...parsed.map((item) => item.c)),
    c2: Math.max(...parsed.map((item) => item.c)),
  };
}
