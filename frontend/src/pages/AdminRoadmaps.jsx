import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ExternalLink, Trash2 } from "lucide-react";

const STATUSES = ["draft", "published", "archived"];
const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-amber-100 text-amber-700",
};

export default function AdminRoadmaps() {
  const { user, loading } = useAuth();
  const [roadmaps, setRoadmaps] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", description: "", cover_emoji: "🗺️", status: "draft" });
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/admin/roadmaps");
      setRoadmaps(data);
    } catch (e) { setErr(formatApiError(e)); }
  };

  useEffect(() => {
    if (user && (user.role === "admin" || user.role === "editor")) load();
  }, [user?.id]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "editor") return <Navigate to="/" replace />;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/roadmaps", form);
      setRoadmaps((prev) => [...prev, data]);
      setCreating(false);
      setForm({ slug: "", title: "", description: "", cover_emoji: "🗺️", status: "draft" });
    } catch (e) { alert(formatApiError(e)); }
  };

  const setStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/roadmaps/${id}/status`, { status });
      setRoadmaps((prev) => prev.map((r) => (r.id === id ? data : r)));
    } catch (e) { alert(formatApiError(e)); }
  };

  const del = async (id, title) => {
    if (!window.confirm(`Delete roadmap "${title}" and all its blocks/progress? This cannot be undone.`)) return;
    try {
      await api.delete(`/roadmaps/${id}`);
      setRoadmaps((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { alert(formatApiError(e)); }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">// {user.role === "admin" ? "Admin" : "Editor"}</div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">Manage roadmaps</h1>
            <p className="mt-2 text-slate-600 text-sm">Create, publish, archive and delete roadmaps.</p>
          </div>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button data-testid="new-roadmap-btn"><Plus size={14} className="mr-1" /> New roadmap</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Create roadmap</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4" data-testid="new-roadmap-form">
                <div>
                  <Label>Cover emoji</Label>
                  <Input value={form.cover_emoji} maxLength={4} onChange={(e) => setField("cover_emoji", e.target.value)} data-testid="new-roadmap-emoji" />
                </div>
                <div>
                  <Label>Slug (a-z, 0-9, dash)</Label>
                  <Input value={form.slug} onChange={(e) => setField("slug", e.target.value.toLowerCase())} required pattern="^[a-z0-9-]+$" data-testid="new-roadmap-slug" />
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setField("title", e.target.value)} required data-testid="new-roadmap-title" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={3} data-testid="new-roadmap-description" />
                </div>
                <div>
                  <Label>Initial status</Label>
                  <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                    value={form.status} onChange={(e) => setField("status", e.target.value)} data-testid="new-roadmap-status">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Button type="submit" className="w-full" data-testid="new-roadmap-submit">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

        <div className="mt-10 space-y-3" data-testid="admin-roadmaps-list">
          {roadmaps.map((r) => (
            <div key={r.id} data-testid={`admin-roadmap-row-${r.slug}`} className="flex items-center gap-4 border border-slate-200 rounded-lg p-4">
              <div className="text-2xl">{r.cover_emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-slate-900 truncate">{r.title}</h3>
                  <span className={`text-xs uppercase tracking-wider font-medium px-2 py-0.5 rounded ${STATUS_BADGE[r.status]}`} data-testid={`admin-roadmap-status-${r.slug}`}>{r.status}</span>
                </div>
                <p className="text-sm text-slate-500 truncate">/{r.slug} · {r.block_count} blocks</p>
              </div>
              <select
                value={r.status}
                onChange={(e) => setStatus(r.id, e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
                data-testid={`admin-status-select-${r.slug}`}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Link to={`/roadmaps/${r.slug}`}>
                <Button size="sm" variant="outline" data-testid={`admin-open-${r.slug}`}>
                  <ExternalLink size={14} className="mr-1" /> Open
                </Button>
              </Link>
              {user.role === "admin" && (
                <Button size="sm" variant="outline" onClick={() => del(r.id, r.title)} data-testid={`admin-delete-roadmap-${r.slug}`}>
                  <Trash2 size={14} className="text-red-600" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
