import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass, CheckCircle2, Layers } from "lucide-react";

const FEATURE_KEYS = [
  { icon: Compass, key: "orderedPaths" },
  { icon: Layers, key: "deepBlockContent" },
  { icon: CheckCircle2, key: "trackProgress" },
];

export default function Home() {
  const [roadmaps, setRoadmaps] = useState([]);
  const { t } = useTranslation("roadmaps");

  useEffect(() => {
    api.get("/roadmaps")
      .then(({ data }) => setRoadmaps(data))
      .catch((err) => console.error("Failed to load roadmaps:", err));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-6">
          {t("home.eyebrow")}
        </div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 max-w-3xl">
          {t("home.title")}
        </h1>
        <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">{t("home.description")}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/roadmaps">
            <Button size="lg" data-testid="home-browse-btn" className="rounded-md">
              {t("home.browseRoadmaps")} <ArrowRight size={16} className="ml-2" />
            </Button>
          </Link>
          <Link to="/register">
            <Button size="lg" variant="outline" data-testid="home-register-btn" className="rounded-md">
              {t("home.createFreeAccount")}
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURE_KEYS.map(({ icon: Icon, key }) => (
            <div key={key} className="border border-slate-200 rounded-lg p-6 hover:border-slate-300 transition-colors bg-white">
              <Icon size={20} className="text-slate-900" />
              <h3 className="mt-3 font-display font-semibold text-lg text-slate-900">{t(`home.features.${key}.title`)}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{t(`home.features.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              {t("home.featuredRoadmaps")}
            </h2>
            <Link to="/roadmaps" className="text-sm text-slate-600 hover:text-slate-900">
              {t("home.viewAll")}
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
                  <span className="text-slate-500 font-mono">{t("badges.blocks", { count: r.block_count })}</span>
                  <span className="text-slate-900 group-hover:translate-x-0.5 transition-transform">-&gt;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
