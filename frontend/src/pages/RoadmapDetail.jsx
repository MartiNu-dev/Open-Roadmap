import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import BlockSidePanel from "@/components/BlockSidePanel";
import { Progress } from "@/components/ui/progress";
import { Check, Circle, Loader2, ArrowLeft } from "lucide-react";

const STATUS_STYLES = {
  not_started: {
    dot: "bg-white border-slate-300 text-slate-400",
    border: "border-slate-200 hover:border-slate-400",
    label: "Not started",
    labelClass: "text-slate-500",
  },
  in_progress: {
    dot: "bg-blue-500 border-blue-500 text-white",
    border: "border-blue-500",
    label: "In progress",
    labelClass: "text-blue-600",
  },
  completed: {
    dot: "bg-emerald-500 border-emerald-500 text-white",
    border: "border-emerald-500",
    label: "Completed",
    labelClass: "text-emerald-600",
  },
};

function StatusDot({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.not_started;
  return (
    <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${s.dot}`}>
      {status === "completed" ? <Check size={18} /> : status === "in_progress" ? <Loader2 size={16} className="animate-spin-slow" /> : <Circle size={10} />}
    </div>
  );
}

export default function RoadmapDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [roadmap, setRoadmap] = useState(null);
  const [progressItems, setProgressItems] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    api.get(`/roadmaps/${slug}`).then(({ data }) => setRoadmap(data));
  }, [slug]);

  const loadProgress = async (roadmapId) => {
    if (!user) { setProgressItems([]); return; }
    try {
      const { data } = await api.get(`/progress/me/${roadmapId}`);
      setProgressItems(data.items);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (roadmap) loadProgress(roadmap.id);
  }, [roadmap, user]);

  const progressByBlock = useMemo(() => {
    const map = {};
    for (const p of progressItems) map[p.block_id] = p;
    return map;
  }, [progressItems]);

  const total = roadmap?.blocks.length || 0;
  const completed = progressItems.filter((p) => p.status === "completed").length;
  const inProgress = progressItems.filter((p) => p.status === "in_progress").length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  const selectedBlock = roadmap?.blocks.find((b) => b.id === selectedBlockId) || null;
  const selectedProgress = selectedBlockId ? progressByBlock[selectedBlockId] : null;

  const openBlock = (blockId) => {
    setSelectedBlockId(blockId);
    setPanelOpen(true);
  };

  const handleStatusChange = async (status) => {
    if (!user || !selectedBlock || !roadmap) return;
    const { data } = await api.post("/progress", {
      roadmap_id: roadmap.id,
      block_id: selectedBlock.id,
      status,
    });
    setProgressItems((prev) => {
      const others = prev.filter((p) => p.block_id !== data.block_id);
      return [...others, data];
    });
  };

  if (!roadmap) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 py-16 text-slate-500" data-testid="roadmap-loading">Loading roadmap…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 pt-10 pb-4">
        <Link to="/roadmaps" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={14} className="mr-1" /> All roadmaps
        </Link>
      </div>

      {/* Sticky header with progress */}
      <div className="sticky top-16 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-6">
          <div className="text-3xl">{roadmap.cover_emoji}</div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 truncate" data-testid="roadmap-title">
              {roadmap.title}
            </h1>
            <p className="text-sm text-slate-500 truncate">{roadmap.description}</p>
          </div>
          {user && (
            <div className="hidden sm:block w-64">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500 font-mono" data-testid="progress-count">
                  {completed}/{total} completed
                </span>
                <span className="font-medium text-slate-900" data-testid="progress-percent">{percent}%</span>
              </div>
              <Progress value={percent} className="h-2" data-testid="progress-bar" />
              {inProgress > 0 && (
                <div className="text-xs text-blue-600 mt-1">{inProgress} in progress</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {!user && (
          <div className="mb-8 border border-slate-200 bg-slate-50 rounded-md p-4 flex items-center justify-between">
            <span className="text-sm text-slate-700">
              <Link to="/login" className="underline font-medium">Log in</Link> or
              {" "}<Link to="/register" className="underline font-medium">create an account</Link> to track your progress.
            </span>
          </div>
        )}

        <div className="relative" data-testid="roadmap-timeline">
          <div className="timeline-line" />
          <div className="space-y-4">
            {roadmap.blocks.map((block, idx) => {
              const p = progressByBlock[block.id];
              const status = p?.status || "not_started";
              const s = STATUS_STYLES[status];
              return (
                <button
                  key={block.id}
                  onClick={() => openBlock(block.id)}
                  data-testid={`block-node-${block.id}`}
                  className="fade-up w-full text-left flex items-start gap-6 relative"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <StatusDot status={status} />
                  <div className={`flex-1 border-2 rounded-md p-4 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${s.border}`}>
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-display font-semibold text-slate-900">
                        <span className="text-slate-400 font-mono text-sm mr-2">{String(idx + 1).padStart(2, "0")}</span>
                        {block.title}
                      </h3>
                      <span className={`text-xs uppercase tracking-wider font-medium ${s.labelClass}`}>
                        {s.label}
                      </span>
                    </div>
                    {block.short_description && (
                      <p className="text-sm text-slate-600 mt-1">{block.short_description}</p>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">{block.level}</span>
                      {block.estimated_duration && <span>~ {block.estimated_duration}</span>}
                      {block.resources?.length > 0 && <span>{block.resources.length} resources</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <BlockSidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        block={selectedBlock}
        progress={selectedProgress}
        onStatusChange={handleStatusChange}
        canEdit={!!user}
      />
    </div>
  );
}
