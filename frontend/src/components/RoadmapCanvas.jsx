import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, Ghost, Loader2, Plus, Square } from "lucide-react";
import { getLevelLabel } from "@/i18n/formatters";

const NODE_STYLES = {
  primary: "bg-yellow-100 border-slate-900 text-slate-900",
  alternative: "bg-orange-50 border-slate-700 text-slate-900",
  optional: "bg-violet-50 border-violet-400 text-violet-900",
  label: "bg-transparent border-transparent text-slate-700 font-display font-semibold",
};
const STATUS_RING = {
  not_started: "", in_progress: "ring-2 ring-blue-500 ring-offset-2",
  completed: "ring-2 ring-emerald-500 ring-offset-2",
};
const LEVEL_CROWN = {
  beginner: { color: "text-yellow-500" },
  intermediate: { color: "text-slate-400" },
  advanced: { color: "text-amber-500" },
};
const THICKNESS = { small: 1.5, medium: 2.5, large: 4 };
const DASH = { solid: "", dashed: "8 6", dotted: "2 5" };
const ANCHOR_POS = {
  top: (p) => ({ x: p.x + p.width / 2, y: p.y }),
  right: (p) => ({ x: p.x + p.width, y: p.y + p.height / 2 }),
  bottom: (p) => ({ x: p.x + p.width / 2, y: p.y + p.height }),
  left: (p) => ({ x: p.x, y: p.y + p.height / 2 }),
};
const GRID = 24;
const snap = (v) => Math.round(v / GRID) * GRID;

const RESIZE_CURSOR = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };

function curvedPath(a, b, fromSide = "bottom", toSide = "top") {
  const off = Math.max(40, Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) / 2));
  const dir = (side) => ({ top: [0, -off], bottom: [0, off], left: [-off, 0], right: [off, 0] }[side]);
  const [c1x, c1y] = dir(fromSide);
  const [c2x, c2y] = dir(toSide);
  return `M ${a.x},${a.y} C ${a.x + c1x},${a.y + c1y} ${b.x + c2x},${b.y + c2y} ${b.x},${b.y}`;
}

function StatusBadge({ status }) {
  if (status === "completed") return <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow-sm" data-testid="block-status-completed"><Check size={12} strokeWidth={3} /></span>;
  if (status === "in_progress") return <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white shadow-sm" data-testid="block-status-in-progress"><Loader2 size={12} className="animate-spin" strokeWidth={3} /></span>;
  return null;
}

function GroupNode({ block, isEditor, editMode, onMouseDownGroup, onAnchorMouseDown, onResizeMouseDown, onClick, suppressClickRef }) {
  const labelTop = block.label_position === "top";
  const align = block.label_align || "center";
  const alignCls = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  const labelStyle = { color: "#fff" };
  const isTransparent = block.visibility_mode === "transparent";
  const isEditInteractive = isEditor && editMode;
  const isInteractive = !isTransparent || isEditInteractive;
  const showTransparentChrome = isTransparent && isEditInteractive;
  const showLabel = block.title && (!isTransparent || showTransparentChrome);
  const labelClassName = `px-3 py-1 text-xs font-mono uppercase tracking-wider ${alignCls}`;

  return (
    <div
      data-block-id={block.id}
      data-block-kind="group"
      data-testid={`canvas-group-${block.id}`}
      className={`absolute select-none group ${isEditInteractive ? "cursor-move" : isInteractive ? "cursor-pointer" : "pointer-events-none"}`}
      style={{ left: block.x, top: block.y, width: block.width, height: block.height, zIndex: 0 }}
      onMouseDown={isEditInteractive ? (e) => onMouseDownGroup(e, block) : undefined}
      onClick={isInteractive ? () => { if (!suppressClickRef.current) onClick?.(block); } : undefined}
      onContextMenu={isInteractive ? (e) => { e.preventDefault(); if (!suppressClickRef.current) onClick?.(block); } : undefined}
    >
      {showTransparentChrome ? (
        <div className="relative flex h-full w-full flex-col rounded-md border border-dashed border-slate-300 bg-white/40">
          {showLabel && labelTop && (
            <div className={labelClassName} style={{ color: "#475569" }} data-testid={`canvas-group-label-${block.id}`}>{block.title}</div>
          )}
          <div className="flex flex-1 items-center justify-center">
            <Ghost size={22} className="text-slate-400" data-testid={`canvas-group-ghost-${block.id}`} />
          </div>
          {showLabel && !labelTop && (
            <div className={labelClassName} style={{ color: "#475569" }} data-testid={`canvas-group-label-${block.id}`}>{block.title}</div>
          )}
        </div>
      ) : isTransparent ? null : (
        <div className="relative w-full h-full rounded-md flex flex-col" style={{ background: block.bg_color || "#0f172a" }}>
          {showLabel && labelTop && (
            <div className={labelClassName} style={labelStyle}>{block.title}</div>
          )}
          <div className="flex-1" />
          {showLabel && !labelTop && (
            <div className={labelClassName} style={labelStyle}>{block.title}</div>
          )}
        </div>
      )}
      {isEditInteractive && (
        <>
          {["top", "right", "bottom", "left"].map((side) => {
            const pos = {
              top: { left: "50%", top: -8, marginLeft: -8 },
              right: { right: -8, top: "50%", marginTop: -8 },
              bottom: { left: "50%", bottom: -8, marginLeft: -8 },
              left: { left: -8, top: "50%", marginTop: -8 },
            }[side];
            return (
              <div key={side} data-no-drag data-anchor-side={side}
                data-testid={`anchor-${side}-${block.id}`}
                className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white opacity-0 group-hover:opacity-100 hover:scale-125 transition cursor-crosshair shadow"
                style={pos}
                onMouseDown={(e) => onAnchorMouseDown(e, block, side)}
              />
            );
          })}
          {["nw", "ne", "sw", "se"].map((corner) => {
            const pos = {
              nw: { left: -6, top: -6 },
              ne: { right: -6, top: -6 },
              sw: { left: -6, bottom: -6 },
              se: { right: -6, bottom: -6 },
            }[corner];
            return (
              <div key={corner} data-no-drag data-resize-corner={corner}
                data-testid={`resize-${corner}-${block.id}`}
                className="absolute w-3 h-3 rounded-sm bg-white border-2 border-slate-900 opacity-0 group-hover:opacity-100 hover:scale-125 transition shadow"
                style={{ ...pos, cursor: RESIZE_CURSOR[corner] }}
                onMouseDown={(e) => onResizeMouseDown(e, block, corner)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

export default function RoadmapCanvas({
  roadmap, progressByBlock, isEditor, editMode,
  onSelectBlock, onMoveBlock, onCreateLink, onDeleteLink, onSelectLink,
  onAddBlockAt, onAddGroupAt, onResizeBlock,
}) {
  const { t } = useTranslation("roadmaps");
  const [positions, setPositions] = useState({});
  const [pendingLink, setPendingLink] = useState(null);
  const [menu, setMenu] = useState(null);
  const draggingRef = useRef(null);
  const suppressClickRef = useRef(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!roadmap) return;
    const next = {};
    for (const block of roadmap.blocks) next[block.id] = { x: block.x, y: block.y, width: block.width, height: block.height };
    setPositions(next);
  }, [roadmap?.id, roadmap?.blocks?.length]);

  const bounds = useMemo(() => {
    let mx = 800;
    let my = 600;
    for (const block of roadmap?.blocks || []) {
      const point = positions[block.id] || block;
      mx = Math.max(mx, point.x + point.width + 100);
      my = Math.max(my, point.y + point.height + 120);
    }
    return { width: mx, height: my };
  }, [roadmap, positions]);

  const canvasPoint = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left + wrapRef.current.scrollLeft, y: e.clientY - rect.top + wrapRef.current.scrollTop };
  };

  const onMouseDownBlock = useCallback((e, block) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-no-drag]")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const initial = positions[block.id] || block;
    draggingRef.current = { id: block.id, startX: e.clientX, startY: e.clientY, initialX: initial.x, initialY: initial.y, moved: false, kind: "block" };
  }, [isEditor, editMode, positions]);

  const onAnchorMouseDown = (e, block, side) => {
    e.preventDefault();
    e.stopPropagation();
    const point = positions[block.id] || block;
    draggingRef.current = { kind: "link", fromId: block.id, fromSide: side, from: ANCHOR_POS[side](point) };
    setPendingLink({ from: ANCHOR_POS[side](point), cursor: canvasPoint(e) });
  };

  const onResizeMouseDown = (e, block, corner) => {
    if (!isEditor || !editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const point = positions[block.id] || block;
    draggingRef.current = {
      kind: "resize", id: block.id, corner,
      startX: e.clientX, startY: e.clientY,
      initialX: point.x, initialY: point.y, initialW: point.width, initialH: point.height,
      moved: false,
    };
  };

  useEffect(() => {
    function onMove(e) {
      const drag = draggingRef.current;
      if (!drag) return;
      if (drag.kind === "block") {
        let dx = e.clientX - drag.startX;
        let dy = e.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        let nx = Math.max(0, drag.initialX + dx);
        let ny = Math.max(0, drag.initialY + dy);
        if (e.shiftKey) { nx = snap(nx); ny = snap(ny); }
        setPositions((prev) => ({ ...prev, [drag.id]: { ...prev[drag.id], x: nx, y: ny } }));
      } else if (drag.kind === "resize") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        let nx = drag.initialX;
        let ny = drag.initialY;
        let nw = drag.initialW;
        let nh = drag.initialH;
        const MIN_W = 80;
        const MIN_H = 36;
        if (drag.corner.includes("e")) nw = Math.max(MIN_W, drag.initialW + dx);
        if (drag.corner.includes("s")) nh = Math.max(MIN_H, drag.initialH + dy);
        if (drag.corner.includes("w")) { nw = Math.max(MIN_W, drag.initialW - dx); nx = drag.initialX + (drag.initialW - nw); }
        if (drag.corner.includes("n")) { nh = Math.max(MIN_H, drag.initialH - dy); ny = drag.initialY + (drag.initialH - nh); }
        if (e.shiftKey) {
          nx = snap(nx);
          ny = snap(ny);
          nw = Math.max(MIN_W, snap(nw));
          nh = Math.max(MIN_H, snap(nh));
        }
        setPositions((prev) => ({ ...prev, [drag.id]: { x: nx, y: ny, width: nw, height: nh } }));
      } else if (drag.kind === "link") {
        setPendingLink((current) => current ? { ...current, cursor: canvasPoint(e) } : null);
      }
    }

    async function onUp(e) {
      const drag = draggingRef.current;
      if (!drag) return;
      draggingRef.current = null;
      if (drag.kind === "block") {
        if (drag.moved) {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 100);
          if (onMoveBlock) {
            const point = positions[drag.id];
            if (point) await onMoveBlock(drag.id, point.x, point.y);
          }
        }
      } else if (drag.kind === "resize") {
        if (drag.moved) {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 100);
          const point = positions[drag.id];
          if (point && onResizeBlock) await onResizeBlock(drag.id, point.x, point.y, point.width, point.height);
        }
      } else if (drag.kind === "link") {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const card = element?.closest("[data-block-id]");
        const targetId = card?.getAttribute("data-block-id");
        const anchorEl = element?.closest("[data-anchor-side]");
        const targetSide = anchorEl?.getAttribute("data-anchor-side") || "top";
        if (targetId && targetId !== drag.fromId && onCreateLink) {
          await onCreateLink({ from_block_id: drag.fromId, to_block_id: targetId, from_side: drag.fromSide, to_side: targetSide });
        }
        setPendingLink(null);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [positions, onMoveBlock, onCreateLink, onResizeBlock]);

  if (!roadmap) return null;

  const handleCanvasDoubleClick = (e) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-block-id]")) return;
    const point = canvasPoint(e);
    onAddBlockAt?.(point.x - 110, point.y - 22);
  };

  const handleCanvasContextMenu = (e) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-block-id]")) return;
    e.preventDefault();
    setMenu({ clientX: e.clientX, clientY: e.clientY, canvas: canvasPoint(e) });
  };

  const groups = (roadmap.blocks || []).filter((block) => block.kind === "group");
  const blocks = (roadmap.blocks || []).filter((block) => block.kind !== "group");

  return (
    <div className="relative" onClick={() => setMenu(null)}>
      {isEditor && editMode && (
        <div className="sticky top-32 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-md px-3 py-2 mb-3 flex items-center gap-3 text-sm w-fit shadow-sm" data-testid="editor-toolbar">
          <span className="font-mono uppercase text-xs tracking-wider text-slate-500">{t("canvas.editorMode")}</span>
          <button onClick={() => onAddBlockAt?.(120, 120)} className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" data-testid="editor-add-block-btn">
            <Plus size={14} /> {t("canvas.addBlock")}
          </button>
          <button onClick={() => onAddGroupAt?.(120, 120)} className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" data-testid="editor-add-group-btn">
            <Square size={14} /> {t("canvas.addGroup")}
          </button>
          <span className="text-slate-400 text-xs">{t("canvas.toolbarHint")}</span>
        </div>
      )}

      <div
        ref={wrapRef}
        className="relative bg-[radial-gradient(circle,_#e2e8f0_1px,_transparent_1px)] [background-size:24px_24px] border border-slate-200 rounded-lg overflow-auto"
        data-testid="roadmap-canvas"
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={handleCanvasContextMenu}
      >
        <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
          <svg className="absolute inset-0 pointer-events-none" width={bounds.width} height={bounds.height} data-testid="canvas-links" style={{ zIndex: 2 }}>
            {(roadmap.links || []).map((link) => {
              const startNode = positions[link.from_block_id];
              const endNode = positions[link.to_block_id];
              if (!startNode || !endNode) return null;
              const fromSide = link.from_side || "bottom";
              const toSide = link.to_side || "top";
              const start = ANCHOR_POS[fromSide](startNode);
              const end = ANCHOR_POS[toSide](endNode);
              const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              const stroke = link.color || "#475569";
              const strokeWidth = THICKNESS[link.thickness] || 2.5;
              const dash = DASH[link.style] || "";
              return (
                <g key={link.id}>
                  <path d={curvedPath(start, end, fromSide, toSide)} stroke="transparent" strokeWidth={14} fill="none"
                    className="cursor-pointer pointer-events-auto"
                    onClick={(e) => { e.stopPropagation(); onSelectLink?.(link); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelectLink?.(link); }}
                  />
                  <path d={curvedPath(start, end, fromSide, toSide)} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeDasharray={dash} className="pointer-events-none" />
                  {link.label && (
                    <g className="pointer-events-none">
                      <rect x={mid.x - link.label.length * 4 - 8} y={mid.y - 11} width={link.label.length * 8 + 16} height={22} rx="6" fill="white" stroke="#cbd5e1" />
                      <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="12" fill={stroke} className="font-mono">{link.label}</text>
                    </g>
                  )}
                  {isEditor && editMode && (
                    <g onClick={(e) => { e.stopPropagation(); onDeleteLink?.(link.id); }} className="cursor-pointer pointer-events-auto">
                      <circle cx={mid.x + 18} cy={mid.y - 14} r="9" fill="white" stroke="#ef4444" />
                      <text x={mid.x + 18} y={mid.y - 10} textAnchor="middle" fontSize="12" fill="#ef4444">×</text>
                    </g>
                  )}
                </g>
              );
            })}
            {pendingLink && (
              <path d={curvedPath(pendingLink.from, pendingLink.cursor, "bottom", "top")} stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" fill="none" />
            )}
          </svg>

          {groups.map((block) => {
            const point = positions[block.id] || block;
            const merged = { ...block, x: point.x, y: point.y, width: point.width, height: point.height };
            return (
              <GroupNode
                key={block.id}
                block={merged}
                isEditor={isEditor}
                editMode={editMode}
                onMouseDownGroup={onMouseDownBlock}
                onAnchorMouseDown={onAnchorMouseDown}
                onResizeMouseDown={onResizeMouseDown}
                onClick={onSelectBlock}
                suppressClickRef={suppressClickRef}
              />
            );
          })}

          {blocks.map((block) => {
            const point = positions[block.id] || block;
            const styleCls = NODE_STYLES[block.node_style] || NODE_STYLES.primary;
            const status = progressByBlock?.[block.id]?.status || "not_started";
            const crown = LEVEL_CROWN[block.level];
            return (
              <div
                key={block.id}
                data-block-id={block.id}
                data-block-kind="block"
                data-testid={`canvas-block-${block.id}`}
                className={`absolute select-none group ${editMode && isEditor ? "cursor-move" : "cursor-pointer"}`}
                style={{ left: point.x, top: point.y, width: point.width, height: point.height, zIndex: 1 }}
                onMouseDown={(e) => onMouseDownBlock(e, block)}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  onSelectBlock?.(block);
                }}
                onContextMenu={(e) => { e.preventDefault(); if (!suppressClickRef.current) onSelectBlock?.(block); }}
              >
                <div className={`relative w-full h-full border-2 rounded-md flex items-center justify-center text-center px-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${styleCls} ${STATUS_RING[status]}`}>
                  {crown && (
                    <span className={`absolute -top-2 -left-2 text-lg ${crown.color} drop-shadow`} title={getLevelLabel(t, block.level)} data-testid={`block-crown-${block.level}`}>👑</span>
                  )}
                  <span className="font-medium text-sm leading-tight">{block.title}</span>
                  <StatusBadge status={status} />
                </div>
                {isEditor && editMode && ["top", "right", "bottom", "left"].map((side) => {
                  const pos = {
                    top: { left: "50%", top: -8, marginLeft: -8 },
                    right: { right: -8, top: "50%", marginTop: -8 },
                    bottom: { left: "50%", bottom: -8, marginLeft: -8 },
                    left: { left: -8, top: "50%", marginTop: -8 },
                  }[side];
                  return (
                    <div key={side} data-no-drag data-anchor-side={side}
                      data-testid={`anchor-${side}-${block.id}`}
                      className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white opacity-0 group-hover:opacity-100 hover:scale-125 transition cursor-crosshair shadow"
                      style={pos}
                      onMouseDown={(e) => onAnchorMouseDown(e, block, side)}
                    />
                  );
                })}
                {isEditor && editMode && ["nw", "ne", "sw", "se"].map((corner) => {
                  const pos = {
                    nw: { left: -6, top: -6 },
                    ne: { right: -6, top: -6 },
                    sw: { left: -6, bottom: -6 },
                    se: { right: -6, bottom: -6 },
                  }[corner];
                  return (
                    <div key={corner} data-no-drag data-resize-corner={corner}
                      data-testid={`resize-${corner}-${block.id}`}
                      className="absolute w-3 h-3 rounded-sm bg-white border-2 border-slate-900 opacity-0 group-hover:opacity-100 hover:scale-125 transition shadow"
                      style={{ ...pos, cursor: RESIZE_CURSOR[corner] }}
                      onMouseDown={(e) => onResizeMouseDown(e, block, corner)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: menu.clientX, top: menu.clientY }}
          onClick={(e) => e.stopPropagation()}
          data-testid="canvas-context-menu"
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
            data-testid="ctx-add-block"
            onClick={() => { onAddBlockAt?.(menu.canvas.x - 110, menu.canvas.y - 22); setMenu(null); }}
          >{t("canvas.addBlockHere")}</button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
            data-testid="ctx-add-group"
            onClick={() => { onAddGroupAt?.(menu.canvas.x - 160, menu.canvas.y - 90); setMenu(null); }}
          >{t("canvas.addGroupHere")}</button>
        </div>
      )}

      {isEditor && editMode && (
        <div className="mt-2 text-xs text-slate-500 font-mono">
          {t("canvas.tip")}
        </div>
      )}
    </div>
  );
}
