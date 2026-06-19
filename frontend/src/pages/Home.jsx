import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass, CheckCircle2, Layers } from "lucide-react";

export default function Home() {
  const [roadmaps, setRoadmaps] = useState([]);

  useEffect(() => {
    api.get("/roadmaps").then(({ data }) => setRoadmaps(data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-6">
          // Learn anything, in order
        </div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 max-w-3xl">
          Community-driven roadmaps to guide your career as a developer.
        </h1>
        <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
          Pick a path. Work through ordered blocks. Track every step with personal progress. No fluff, no AI guesses — just curated knowledge you can ship.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/roadmaps">
            <Button size="lg" data-testid="home-browse-btn" className="rounded-md">
              Browse roadmaps <ArrowRight size={16} className="ml-2" />
            </Button>
          </Link>
          <Link to="/register">
            <Button size="lg" variant="outline" data-testid="home-register-btn" className="rounded-md">
              Create free account
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Compass, title: "Ordered paths", body: "Every roadmap is a sequence of blocks. No more guessing what comes next." },
            { icon: Layers, title: "Deep block content", body: "Each block has detailed notes, recommended resources and an estimated duration." },
            { icon: CheckCircle2, title: "Track your progress", body: "Mark blocks as in progress or complete. Your journey is saved per-account." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-colors bg-white">
              <Icon size={20} className="text-slate-900" />
              <h3 className="mt-3 font-display font-semibold text-lg text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Featured roadmaps
            </h2>
            <Link to="/roadmaps" className="text-sm text-slate-600 hover:text-slate-900">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roadmaps.map((r) => (
              <Link key={r.id} to={`/roadmaps/${r.slug}`} data-testid={`home-roadmap-card-${r.slug}`}
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
        </div>
      </section>
    </div>
  );
}
