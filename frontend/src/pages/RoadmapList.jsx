import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

const LEVELS = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "mixed", label: "Mixed" },
];

const LEVEL_BADGE = {
  beginner: "bg-emerald-100 text-emerald-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-amber-100 text-amber-700",
  mixed: "bg-slate-100 text-slate-700",
};

export default function RoadmapList() {
  const [roadmaps, setRoadmaps] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [level, setLevel] = useState("all");

  // Fetch tag bag once
  useEffect(() => {
    api.get("/tags").then(({ data }) => setTags(data)).catch(() => setTags([]));
  }, []);

  // Debounced filtered fetch
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (activeTag) params.set("tag", activeTag);
    if (level && level !== "all") params.set("level", level);
    const t = setTimeout(() => {
      api.get(`/roadmaps${params.toString() ? `?${params}` : ""}`)
        .then(({ data }) => setRoadmaps(data))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, activeTag, level]);

  const clearFilters = () => { setQ(""); setActiveTag(null); setLevel("all"); };
  const hasFilters = useMemo(() => !!(q || activeTag || (level && level !== "all")), [q, activeTag, level]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-10">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">
            // Browse all
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">
            Roadmaps
          </h1>
          <p className="mt-3 text-slate-600 max-w-xl">
            Published learning paths covering frontend, backend, devops and more.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 space-y-4" data-testid="roadmaps-filters">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search roadmaps by title or description…"
                className="pl-9"
                data-testid="roadmap-search-input"
              />
            </div>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="h-10 border border-slate-200 rounded-md px-3 text-sm bg-white sm:w-48"
              data-testid="roadmap-level-filter"
            >
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 px-3"
                data-testid="roadmap-clear-filters"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="roadmap-tag-chips">
              {tags.map((t) => {
                const active = activeTag === t;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTag(active ? null : t)}
                    data-testid={`tag-chip-${t}`}
                    aria-pressed={active}
                    className={`text-xs font-mono px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-900 hover:text-slate-900"
                    }`}
                  >
                    #{t}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm" data-testid="roadmaps-loading">Loading…</div>
        ) : roadmaps.length === 0 ? (
          <div className="text-slate-500 text-sm border border-dashed border-slate-200 rounded-md py-10 text-center" data-testid="roadmaps-empty">
            No roadmaps match your filters.{" "}
            <button onClick={clearFilters} className="underline">Clear filters</button>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="roadmaps-grid">
            {roadmaps.map((r) => {
              const tagList = (r.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
              return (
                <Link key={r.id} to={`/roadmaps/${r.slug}`} data-testid={`roadmap-card-${r.slug}`}
                  className="group border border-slate-200 rounded-lg p-6 bg-white hover:border-slate-900 transition-colors flex flex-col">
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{r.cover_emoji}</div>
                    {r.level && (
                      <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded ${LEVEL_BADGE[r.level] || LEVEL_BADGE.mixed}`} data-testid={`roadmap-level-${r.slug}`}>
                        {r.level}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 font-display font-semibold text-lg text-slate-900">{r.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{r.description}</p>
                  {tagList.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1" data-testid={`roadmap-tags-${r.slug}`}>
                      {tagList.slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">#{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-mono">{r.block_count} blocks</span>
                    <span className="text-slate-900 group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
