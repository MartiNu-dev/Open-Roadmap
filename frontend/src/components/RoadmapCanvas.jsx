/**
 * Interactive 2D roadmap canvas with anchor-drag link creation, drag-vs-click
 * separation, level crowns, and link labels.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

const NODE_STYLES = {
  primary: "bg-yellow-100 border-slate-900 text-slate-900",
  alternative: "bg-orange-50 border-slate-700 text-slate-900",
  optional: "bg-violet-50 border-violet-400 text-violet-900",
  label: "bg-transparent border-transparent text-slate-700 font-display font-semibold",
};

const STATUS_RING = {
  not_started: "",
  in_progress: "ring-2 ring-blue-500 ring-offset-2",
  completed: "ring-2 ring-emerald-500 ring-offset-2",
};

// Crown emoji per level — "" means no level => no crown
const LEVEL_CROWN = {
  beginner: { emoji: "👑", color: "text-yellow-500", title: "Beginner" },
  intermediate: { emoji: "👑", color: "text-slate-400", title: "Intermediate" },
  advanced: { emoji: "👑", color: "text-amber-500", title: "Advanced" },
};

const ANCHOR_POS = {
  top: (p) => ({ x: p.x + p.width / 2, y: p.y }),
  right: (p) => ({ x: p.x + p.width, y: p.y + p.height / 2 }),
  bottom: (p) => ({ x: p.x + p.width / 2, y: p.y + p.height }),
  left: (p) => ({ x: p.x, y: p.y + p.height / 2 }),
};

function curvedPath(a, b) {
  const dy = b.y - a.y;
  const offset = Math.min(80, Math.abs(dy) / 2 + 20);
  return `M ${a.x},${a.y} C ${a.x},${a.y + offset} ${b.x},${b.y - offset} ${b.x},${b.y}`;
}

function StatusBadge({ status }) {
  if (status === "completed")
    return <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow-sm" data-testid="block-status-completed"><Check size={12} strokeWidth={3} /></span>;
  if (status === "in_progress")
    return <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white shadow-sm" data-testid="block-status-in-progress"><Loader2 size={12} className="animate-spin" strokeWidth={3} /></span>;
  return null;
}

export default function RoadmapCanvas({
  roadmap, progressByBlock, isEditor, editMode,
  onSelectBlock, onMoveBlock, onCreateLink, onDeleteLink, onSelectLink, onAddBlock,
}) {
  const [positions, setPositions] = useState({});
  const [pendingLink, setPendingLink] = useState(null); // {fromId, from:{x,y}, cursor:{x,y}}
  const draggingRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!roadmap) return;
    const next = {};
    for (const b of roadmap.blocks) next[b.id] = { x: b.x, y: b.y, width: b.width, height: b.height };
    setPositions(next);
  }, [roadmap?.id, roadmap?.blocks?.length]);

  const bounds = useMemo(() => {
    let maxX = 800, maxY = 600;
    for (const b of roadmap?.blocks || []) {
      const p = positions[b.id] || b;
      maxX = Math.max(maxX, p.x + p.width + 100);
      maxY = Math.max(maxY, p.y + p.height + 120);
    }
    return { width: maxX, height: maxY };
  }, [roadmap, positions]);

  const onMouseDownBlock = useCallback((e, block) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-no-drag]")) return;
    e.preventDefault(); e.stopPropagation();
    const initial = positions[block.id] || block;
    draggingRef.current = {
      id: block.id, startX: e.clientX, startY: e.clientY,
      initialX: initial.x, initialY: initial.y, moved: false, kind: "block",
    };
  }, [isEditor, editMode, positions]);

  const canvasPoint = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left + wrapRef.current.scrollLeft, y: e.clientY - rect.top + wrapRef.current.scrollTop };
  };

  const onAnchorMouseDown = (e, block, side) => {
    e.preventDefault(); e.stopPropagation();
    const p = positions[block.id] || block;
    const from = ANCHOR_POS[side](p);
    setPendingLink({ fromId: block.id, from, cursor: canvasPoint(e) });
    draggingRef.current = { kind: "link", fromId: block.id, from };
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
        if (d.moved && onMoveBlock) {
          const p = positions[d.id]; if (p) await onMoveBlock(d.id, p.x, p.y);
        }
        // expose moved flag to onClick handler via window cache (clears next tick)
        window.__rmLastDragMoved = !!d.moved;
        setTimeout(() => { window.__rmLastDragMoved = false; }, 50);
      } else if (d.kind === "link") {
        // find target block under cursor
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        const targetCard = targetEl?.closest("[data-block-id]");
        const targetId = targetCard?.getAttribute("data-block-id");
        if (targetId && targetId !== d.fromId && onCreateLink) {
          await onCreateLink(d.fromId, targetId);
        }
        setPendingLink(null);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [positions, onMoveBlock, onCreateLink]);

  if (!roadmap) return null;

  return (
    <div className="relative">
      {isEditor && editMode && (
        <div className="sticky top-32 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-md px-3 py-2 mb-3 flex items-center gap-3 text-sm w-fit shadow-sm" data-testid="editor-toolbar">
          <span className="font-mono uppercase text-xs tracking-wider text-slate-500">Editor mode</span>
          <button onClick={() => onAddBlock?.()} className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" data-testid="editor-add-block-btn">
            <Plus size={14} /> Add block
          </button>
          <span className="text-slate-400 text-xs">drag any side handle to link blocks</span>
        </div>
      )}

      <div
        ref={wrapRef}
        className="relative bg-[radial-gradient(circle,_#e2e8f0_1px,_transparent_1px)] [background-size:24px_24px] border border-slate-200 rounded-lg overflow-auto"
        data-testid="roadmap-canvas"
      >
        <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
          <svg className="absolute inset-0 pointer-events-none" width={bounds.width} height={bounds.height} data-testid="canvas-links">
            {(roadmap.links || []).map((link) => {
              const a = positions[link.from_block_id], b = positions[link.to_block_id];
              if (!a || !b) return null;
              const start = ANCHOR_POS.bottom(a);
              const end = ANCHOR_POS.top(b);
              const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              return (
                <g key={link.id} className={isEditor && editMode ? "pointer-events-auto" : ""}>
                  <path
                    d={curvedPath(start, end)}
                    stroke="#475569" strokeWidth={2} fill="none"
                    strokeDasharray={link.style === "dashed" ? "6 6" : ""}
                  />
                  {link.label && (
                    <g>
                      <rect x={mid.x - link.label.length * 4 - 8} y={mid.y - 11} width={link.label.length * 8 + 16} height={22}
                        rx="6" fill="white" stroke="#cbd5e1" />
                      <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="12" fill="#475569" className="font-mono">{link.label}</text>
                    </g>
                  )}
                  {isEditor && editMode && (
                    <>
                      {onSelectLink && (
                        <circle cx={mid.x + 14} cy={mid.y + 16} r="9" fill="white" stroke="#3b82f6" className="cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); onSelectLink(link); }} />
                      )}
                      <g onClick={(e) => { e.stopPropagation(); onDeleteLink?.(link.id); }} className="cursor-pointer">
                        <circle cx={mid.x - 14} cy={mid.y + 16} r="9" fill="white" stroke="#ef4444" />
                        <text x={mid.x - 14} y={mid.y + 20} textAnchor="middle" fontSize="12" fill="#ef4444">×</text>
                      </g>
                    </>
                  )}
                </g>
              );
            })}
            {pendingLink && (
              <path
                d={curvedPath(pendingLink.from, pendingLink.cursor)}
                stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" fill="none"
              />
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
                  if (window.__rmLastDragMoved) return; // suppress click after drag
                  if (e.button === 2) return;
                  onSelectBlock?.(block);
                }}
                onContextMenu={(e) => { e.preventDefault(); onSelectBlock?.(block); }}
              >
                <div className={`relative w-full h-full border-2 rounded-md flex items-center justify-center text-center px-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${styleCls} ${STATUS_RING[status]}`}>
                  {crown && (
                    <span className={`absolute -top-2 -left-2 text-lg ${crown.color} drop-shadow`} title={crown.title} data-testid={`block-crown-${block.level}`}>
                      {crown.emoji}
                    </span>
                  )}
                  <span className="font-medium text-sm leading-tight">{block.title}</span>
                  <StatusBadge status={status} />
                </div>

                {isEditor && editMode && (
                  <>
                    {["top", "right", "bottom", "left"].map((side) => {
                      const pos = {
                        top: { left: "50%", top: -8, marginLeft: -8 },
                        right: { right: -8, top: "50%", marginTop: -8 },
                        bottom: { left: "50%", bottom: -8, marginLeft: -8 },
                        left: { left: -8, top: "50%", marginTop: -8 },
                      }[side];
                      return (
                        <div
                          key={side}
                          data-no-drag
                          data-testid={`anchor-${side}-${block.id}`}
                          className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white opacity-0 group-hover:opacity-100 hover:scale-125 transition cursor-crosshair shadow"
                          style={pos}
                          onMouseDown={(e) => onAnchorMouseDown(e, block, side)}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isEditor && editMode && (
        <div className="mt-2 text-xs text-slate-500 font-mono">
          Tip: drag blocks to reposition · hover a block then drag a blue side handle into another block to create a link · ✕ removes a link · click the blue dot mid-link to edit label/style.
        </div>
      )}
    </div>
  );
}
