import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Check, Loader2, Plus } from "lucide-react";

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
  beginner: { color: "text-yellow-500", title: "Beginner" },
  intermediate: { color: "text-slate-400", title: "Intermediate" },
  advanced: { color: "text-amber-500", title: "Advanced" },
};
const THICKNESS = { small: 1.5, medium: 2.5, large: 4 };
const DASH = { solid: "", dashed: "8 6", dotted: "2 5" };
const ANCHOR_POS = {
  top: (p) => ({ x: p.x + p.width / 2, y: p.y }),
  right: (p) => ({ x: p.x + p.width, y: p.y + p.height / 2 }),
  bottom: (p) => ({ x: p.x + p.width / 2, y: p.y + p.height }),
  left: (p) => ({ x: p.x, y: p.y + p.height / 2 }),
};

function curvedPath(a, b, fromSide = "bottom", toSide = "top") {
  // Use perpendicular control points based on which side each anchor is on
  const off = Math.max(40, Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) / 2));
  const dir = (side) => ({ top: [0, -off], bottom: [0, off], left: [-off, 0], right: [off, 0] }[side]);
  const [c1x, c1y] = dir(fromSide); const [c2x, c2y] = dir(toSide);
  return `M ${a.x},${a.y} C ${a.x + c1x},${a.y + c1y} ${b.x + c2x},${b.y + c2y} ${b.x},${b.y}`;
}

function StatusBadge({ status }) {
  if (status === "completed") return <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow-sm" data-testid="block-status-completed"><Check size={12} strokeWidth={3} /></span>;
  if (status === "in_progress") return <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white shadow-sm" data-testid="block-status-in-progress"><Loader2 size={12} className="animate-spin" strokeWidth={3} /></span>;
  return null;
}

export default function RoadmapCanvas({
  roadmap, progressByBlock, isEditor, editMode,
  onSelectBlock, onMoveBlock, onCreateLink, onDeleteLink, onSelectLink, onAddBlockAt,
}) {
  const [positions, setPositions] = useState({});
  const [pendingLink, setPendingLink] = useState(null);
  const [menu, setMenu] = useState(null); // {x, y}
  const draggingRef = useRef(null);
  const suppressClickRef = useRef(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!roadmap) return;
    const next = {};
    for (const b of roadmap.blocks) next[b.id] = { x: b.x, y: b.y, width: b.width, height: b.height };
    setPositions(next);
  }, [roadmap?.id, roadmap?.blocks?.length]);

  const bounds = useMemo(() => {
    let mx = 800, my = 600;
    for (const b of roadmap?.blocks || []) {
      const p = positions[b.id] || b;
      mx = Math.max(mx, p.x + p.width + 100);
      my = Math.max(my, p.y + p.height + 120);
    }
    return { width: mx, height: my };
  }, [roadmap, positions]);

  const canvasPoint = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left + wrapRef.current.scrollLeft, y: e.clientY - rect.top + wrapRef.current.scrollTop };
  };

  const onMouseDownBlock = useCallback((e, block) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-no-drag]")) return;
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const initial = positions[block.id] || block;
    draggingRef.current = { id: block.id, startX: e.clientX, startY: e.clientY, initialX: initial.x, initialY: initial.y, moved: false, kind: "block" };
  }, [isEditor, editMode, positions]);

  const onAnchorMouseDown = (e, block, side) => {
    e.preventDefault(); e.stopPropagation();
    const p = positions[block.id] || block;
    draggingRef.current = { kind: "link", fromId: block.id, fromSide: side, from: ANCHOR_POS[side](p) };
    setPendingLink({ from: ANCHOR_POS[side](p), cursor: canvasPoint(e) });
  };

  useEffect(() => {
    function onMove(e) {
      const d = draggingRef.current; if (!d) return;
      if (d.kind === "block") {
        const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        setPositions((prev) => ({ ...prev, [d.id]: { ...prev[d.id], x: Math.max(0, d.initialX + dx), y: Math.max(0, d.initialY + dy) } }));
      } else if (d.kind === "link") {
        setPendingLink((pl) => pl ? { ...pl, cursor: canvasPoint(e) } : null);
      }
    }
    async function onUp(e) {
      const d = draggingRef.current; if (!d) return;
      draggingRef.current = null;
      if (d.kind === "block") {
        if (d.moved) {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 100);
          if (onMoveBlock) { const p = positions[d.id]; if (p) await onMoveBlock(d.id, p.x, p.y); }
        }
      } else if (d.kind === "link") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el?.closest("[data-block-id]");
        const targetId = card?.getAttribute("data-block-id");
        const anchorEl = el?.closest("[data-anchor-side]");
        const targetSide = anchorEl?.getAttribute("data-anchor-side") || "top";
        if (targetId && targetId !== d.fromId && onCreateLink) {
          await onCreateLink({ from_block_id: d.fromId, to_block_id: targetId, from_side: d.fromSide, to_side: targetSide });
        }
        setPendingLink(null);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [positions, onMoveBlock, onCreateLink]);

  if (!roadmap) return null;

  const handleCanvasDoubleClick = (e) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-block-id]")) return;
    const p = canvasPoint(e);
    onAddBlockAt?.(p.x - 110, p.y - 32);
  };

  const handleCanvasContextMenu = (e) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-block-id]")) return;
    e.preventDefault();
    setMenu({ clientX: e.clientX, clientY: e.clientY, canvas: canvasPoint(e) });
  };

  return (
    <div className="relative" onClick={() => setMenu(null)}>
      {isEditor && editMode && (
        <div className="sticky top-32 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-md px-3 py-2 mb-3 flex items-center gap-3 text-sm w-fit shadow-sm" data-testid="editor-toolbar">
          <span className="font-mono uppercase text-xs tracking-wider text-slate-500">Editor mode</span>
          <button onClick={() => onAddBlockAt?.(120, 120)} className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" data-testid="editor-add-block-btn">
            <Plus size={14} /> Add block
          </button>
          <span className="text-slate-400 text-xs">double-click or right-click empty area to add · drag side handles to link</span>
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
          <svg className="absolute inset-0 pointer-events-none" width={bounds.width} height={bounds.height} data-testid="canvas-links">
            {(roadmap.links || []).map((link) => {
              const a = positions[link.from_block_id], b = positions[link.to_block_id];
              if (!a || !b) return null;
              const fs = link.from_side || "bottom", ts = link.to_side || "top";
              const start = ANCHOR_POS[fs](a), end = ANCHOR_POS[ts](b);
              const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              const stroke = link.color || "#475569";
              const sw = THICKNESS[link.thickness] || 2.5;
              const dash = DASH[link.style] || "";
              return (
                <g key={link.id} className={isEditor && editMode ? "pointer-events-auto" : "pointer-events-auto"}>
                  {/* invisible wider hit area */}
                  <path d={curvedPath(start, end, fs, ts)} stroke="transparent" strokeWidth={14} fill="none"
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onSelectLink?.(link); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelectLink?.(link); }}
                  />
                  <path d={curvedPath(start, end, fs, ts)} stroke={stroke} strokeWidth={sw} fill="none" strokeDasharray={dash} className="pointer-events-none" />
                  {link.label && (
                    <g className="pointer-events-none">
                      <rect x={mid.x - link.label.length * 4 - 8} y={mid.y - 11} width={link.label.length * 8 + 16} height={22} rx="6" fill="white" stroke="#cbd5e1" />
                      <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="12" fill={stroke} className="font-mono">{link.label}</text>
                    </g>
                  )}
                  {isEditor && editMode && (
                    <g onClick={(e) => { e.stopPropagation(); onDeleteLink?.(link.id); }} className="cursor-pointer">
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

          {roadmap.blocks.map((block) => {
            const p = positions[block.id] || block;
            const styleCls = NODE_STYLES[block.node_style] || NODE_STYLES.primary;
            const status = progressByBlock?.[block.id]?.status || "not_started";
            const crown = LEVEL_CROWN[block.level];
            return (
              <div
                key={block.id}
                data-block-id={block.id}
                data-testid={`canvas-block-${block.id}`}
                className={`absolute select-none group ${editMode && isEditor ? "cursor-move" : "cursor-pointer"}`}
                style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
                onMouseDown={(e) => onMouseDownBlock(e, block)}
                onClick={(e) => {
                  if (suppressClickRef.current) return;
                  onSelectBlock?.(block);
                }}
                onContextMenu={(e) => { e.preventDefault(); if (!suppressClickRef.current) onSelectBlock?.(block); }}
              >
                <div className={`relative w-full h-full border-2 rounded-md flex items-center justify-center text-center px-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${styleCls} ${STATUS_RING[status]}`}>
                  {crown && (
                    <span className={`absolute -top-2 -left-2 text-lg ${crown.color} drop-shadow`} title={crown.title} data-testid={`block-crown-${block.level}`}>👑</span>
                  )}
                  <span className="font-medium text-sm leading-tight">{block.title}</span>
                  <StatusBadge status={status} />
                </div>
                {isEditor && editMode && ["top","right","bottom","left"].map((side) => {
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
            onClick={() => { onAddBlockAt?.(menu.canvas.x - 110, menu.canvas.y - 32); setMenu(null); }}
          >+ Add block here</button>
        </div>
      )}

      {isEditor && editMode && (
        <div className="mt-2 text-xs text-slate-500 font-mono">
          Tip: drag side handles to link · click or right-click any link to edit its style, color, thickness, label and sides.
        </div>
      )}
    </div>
  );
}
