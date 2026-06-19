/**
 * Interactive 2D roadmap canvas.
 * - SVG layer renders curved links between block centers.
 * - DOM layer renders blocks as absolutely-positioned cards.
 * - Editor mode: drag blocks (mouse), link-create mode, delete via panel.
 * - Viewer mode: click block to open side panel, progress overlay.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Check, Loader2, Plus, Link2, Trash2, X } from "lucide-react";

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

function StatusBadge({ status }) {
  if (status === "completed") {
    return (
      <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow-sm" data-testid="block-status-completed">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white shadow-sm" data-testid="block-status-in-progress">
        <Loader2 size={12} className="animate-spin" strokeWidth={3} />
      </span>
    );
  }
  return null;
}

function curvedPath(a, b) {
  // a, b = {x, y} centers
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mx = a.x + dx / 2;
  const my = a.y + dy / 2;
  // Smooth S-curve via two control points offset perpendicular to direction
  const offset = Math.min(80, Math.abs(dy) / 2 + 20);
  return `M ${a.x},${a.y} C ${a.x},${a.y + offset} ${b.x},${b.y - offset} ${b.x},${b.y}`;
}

export default function RoadmapCanvas({
  roadmap,
  progressByBlock,
  isEditor,
  editMode,
  onSelectBlock,
  onMoveBlock,
  onCreateLink,
  onDeleteLink,
  onAddBlock,
}) {
  const [positions, setPositions] = useState({});
  const [linkSourceId, setLinkSourceId] = useState(null);
  const draggingRef = useRef(null);
  const wrapRef = useRef(null);

  // Sync positions from server data when roadmap changes.
  useEffect(() => {
    if (!roadmap) return;
    const next = {};
    for (const b of roadmap.blocks) next[b.id] = { x: b.x, y: b.y, width: b.width, height: b.height };
    setPositions(next);
  }, [roadmap?.id, roadmap?.blocks?.length]);

  const bounds = useMemo(() => {
    let maxX = 800, maxY = 600;
    for (const b of roadmap?.blocks || []) {
      const p = positions[b.id] || { x: b.x, y: b.y, width: b.width, height: b.height };
      maxX = Math.max(maxX, p.x + p.width + 100);
      maxY = Math.max(maxY, p.y + p.height + 100);
    }
    return { width: maxX, height: maxY };
  }, [roadmap, positions]);

  const onMouseDownBlock = useCallback((e, block) => {
    if (!isEditor || !editMode) return;
    if (e.target.closest("[data-no-drag]")) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initial = positions[block.id] || { x: block.x, y: block.y };
    draggingRef.current = { id: block.id, startX, startY, initialX: initial.x, initialY: initial.y, moved: false };
  }, [isEditor, editMode, positions]);

  useEffect(() => {
    function onMove(e) {
      const d = draggingRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setPositions((prev) => ({
        ...prev,
        [d.id]: { ...prev[d.id], x: Math.max(0, d.initialX + dx), y: Math.max(0, d.initialY + dy) },
      }));
    }
    async function onUp() {
      const d = draggingRef.current;
      if (!d) return;
      draggingRef.current = null;
      if (d.moved && onMoveBlock) {
        const p = positions[d.id];
        if (p) await onMoveBlock(d.id, p.x, p.y);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [positions, onMoveBlock]);

  const handleBlockClick = (block, wasDrag) => {
    if (wasDrag) return;
    if (isEditor && editMode && linkSourceId) {
      if (linkSourceId !== block.id && onCreateLink) {
        onCreateLink(linkSourceId, block.id);
      }
      setLinkSourceId(null);
      return;
    }
    onSelectBlock?.(block);
  };

  if (!roadmap) return null;

  return (
    <div className="relative" ref={wrapRef}>
      {isEditor && editMode && (
        <div className="sticky top-32 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-md px-3 py-2 mb-3 flex items-center gap-3 text-sm w-fit shadow-sm" data-testid="editor-toolbar">
          <span className="font-mono uppercase text-xs tracking-wider text-slate-500">Editor mode</span>
          <button onClick={() => onAddBlock?.()} className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" data-testid="editor-add-block-btn">
            <Plus size={14} /> Add block
          </button>
          <button
            onClick={() => setLinkSourceId(linkSourceId ? null : "__pick__")}
            className={`inline-flex items-center gap-1 ${linkSourceId ? "text-blue-600" : "text-slate-700 hover:text-slate-900"}`}
            data-testid="editor-link-mode-btn">
            <Link2 size={14} /> {linkSourceId ? "Pick source then target…" : "Link blocks"}
          </button>
          {linkSourceId && (
            <button onClick={() => setLinkSourceId(null)} className="text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
          )}
        </div>
      )}

      <div
        className="relative bg-[radial-gradient(circle,_#e2e8f0_1px,_transparent_1px)] [background-size:24px_24px] border border-slate-200 rounded-lg overflow-auto"
        style={{ maxHeight: "75vh" }}
        data-testid="roadmap-canvas"
      >
        <div
          className="relative"
          style={{ width: bounds.width, height: bounds.height }}
          onClick={(e) => { if (linkSourceId === "__pick__") setLinkSourceId(null); /* clicking empty area cancels */ }}
        >
          {/* SVG link layer */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={bounds.width} height={bounds.height}
            data-testid="canvas-links"
          >
            {(roadmap.links || []).map((link) => {
              const a = positions[link.from_block_id];
              const b = positions[link.to_block_id];
              if (!a || !b) return null;
              const start = { x: a.x + a.width / 2, y: a.y + a.height };
              const end = { x: b.x + b.width / 2, y: b.y };
              return (
                <g key={link.id} className={isEditor && editMode ? "pointer-events-auto" : ""}>
                  <path
                    d={curvedPath(start, end)}
                    stroke="#475569"
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray={link.style === "dashed" ? "6 6" : ""}
                  />
                  {isEditor && editMode && (
                    <g onClick={() => onDeleteLink?.(link.id)} className="cursor-pointer">
                      <circle cx={(start.x + end.x) / 2} cy={(start.y + end.y) / 2} r="10" fill="white" stroke="#ef4444" />
                      <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 + 4} textAnchor="middle" fontSize="14" fill="#ef4444">×</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {roadmap.blocks.map((block) => {
            const p = positions[block.id] || { x: block.x, y: block.y, width: block.width, height: block.height };
            const styleCls = NODE_STYLES[block.node_style] || NODE_STYLES.primary;
            const progress = progressByBlock?.[block.id];
            const status = progress?.status || "not_started";
            const isLinkSource = linkSourceId && linkSourceId !== "__pick__" && linkSourceId === block.id;
            return (
              <div
                key={block.id}
                data-testid={`canvas-block-${block.id}`}
                className={`absolute select-none ${editMode && isEditor ? "cursor-move" : "cursor-pointer"}`}
                style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
                onMouseDown={(e) => onMouseDownBlock(e, block)}
                onClick={(e) => {
                  const wasDrag = draggingRef.current === null && false; // dragging is reset on mouseup before click in most cases
                  // Detect drag by checking if mouse moved noticeably before click; we already cleared draggingRef on mouseup
                  // Use a small flag: if e.detail > 0 and onClick fires, treat as click unless dragging persisted
                  if (isEditor && editMode && linkSourceId === "__pick__") {
                    setLinkSourceId(block.id);
                    return;
                  }
                  handleBlockClick(block, false);
                }}
              >
                <div
                  className={`relative w-full h-full border-2 rounded-md flex items-center justify-center text-center px-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${styleCls} ${STATUS_RING[status]} ${isLinkSource ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
                >
                  <span className="font-medium text-sm leading-tight">{block.title}</span>
                  <StatusBadge status={status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isEditor && editMode && (
        <div className="mt-2 text-xs text-slate-500 font-mono">
          Tip: drag blocks to reposition · click "Link blocks" then pick source then target · click × on a link to remove.
        </div>
      )}
    </div>
  );
}
