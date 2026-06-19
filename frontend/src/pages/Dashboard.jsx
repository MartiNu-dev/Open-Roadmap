import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Progress } from "@/components/ui/progress";

export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: roadmaps } = await api.get("/roadmaps");
      const summaries = await Promise.all(
        roadmaps.map(async (r) => {
          const { data: prog } = await api.get(`/progress/me/${r.id}`);
          return { roadmap: r, prog };
        })
      );
      if (!cancelled) {
        setItems(summaries);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-10">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">// Welcome back, {user?.name}</div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">Your dashboard</h1>
          <p className="mt-3 text-slate-600">Continue where you left off.</p>
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="space-y-4" data-testid="dashboard-list">
            {items.map(({ roadmap, prog }) => (
              <Link key={roadmap.id} to={`/roadmaps/${roadmap.slug}`}
                data-testid={`dashboard-card-${roadmap.slug}`}
                className="flex items-center gap-6 border border-slate-200 rounded-lg p-5 hover:border-slate-900 transition-colors">
                <div className="text-3xl">{roadmap.cover_emoji}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-lg text-slate-900">{roadmap.title}</h3>
                  <p className="text-sm text-slate-500 truncate">{roadmap.description}</p>
                </div>
                <div className="w-48 shrink-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500 font-mono">{prog.completed_blocks}/{prog.total_blocks}</span>
                    <span className="font-medium">{prog.percent_complete}%</span>
                  </div>
                  <Progress value={prog.percent_complete} className="h-2" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
