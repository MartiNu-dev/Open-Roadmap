import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function RoadmapList() {
  const [roadmaps, setRoadmaps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/roadmaps").then(({ data }) => setRoadmaps(data)).finally(() => setLoading(false));
  }, []);

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

        {loading ? (
          <div className="text-slate-500 text-sm" data-testid="roadmaps-loading">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="roadmaps-grid">
            {roadmaps.map((r) => (
              <Link key={r.id} to={`/roadmaps/${r.slug}`} data-testid={`roadmap-card-${r.slug}`}
                className="group border border-slate-200 rounded-lg p-6 bg-white hover:border-slate-900 transition-colors">
                <div className="text-3xl">{r.cover_emoji}</div>
                <h3 className="mt-3 font-display font-semibold text-lg text-slate-900">{r.title}</h3>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">{r.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono">{r.block_count} blocks</span>
                  <span className="text-slate-900 group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
