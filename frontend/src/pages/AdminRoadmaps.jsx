import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import api, { formatApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getLevelLabel, getRoadmapStatusLabel } from "@/i18n/formatters";
import { Plus, ExternalLink, Trash2, Download, Upload } from "lucide-react";

const STATUSES = ["draft", "published", "archived"];
const LEVELS = ["beginner", "intermediate", "advanced", "mixed"];
const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-amber-100 text-amber-700",
};

function parseFilename(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const basicMatch = contentDisposition.match(/filename="([^"]+)"/i) || contentDisposition.match(/filename=([^;]+)/i);
  return basicMatch?.[1]?.trim() || fallback;
}

function triggerDownload(blob, filename) {
  const href = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(href);
}

function exportFallbackFilename(roadmaps, roadmapIds) {
  if (roadmapIds.length === 1) {
    const selected = roadmaps.find((entry) => entry.id === roadmapIds[0]);
    return selected ? `${selected.slug}.json` : "roadmap.json";
  }
  return "open-roadmap-export.zip";
}

function MetaEditor({ roadmap, onSave, t }) {
  const [tags, setTags] = useState(roadmap.tags || "");
  const [level, setLevel] = useState(roadmap.level || "mixed");
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    setTags(roadmap.tags || "");
    setLevel(roadmap.level || "mixed");
  }, [roadmap.id, roadmap.tags, roadmap.level]);

  useEffect(() => {
    const changed = tags !== (roadmap.tags || "") || level !== (roadmap.level || "mixed");
    if (!changed) return;
    const timeoutId = setTimeout(async () => {
      try {
        await onSave({ tags, level });
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1200);
      } catch (e) {
        void e;
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [tags, level, roadmap.tags, roadmap.level, onSave]);

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder={t("admin:roadmaps.metaTagsPlaceholder")}
        className="h-8 text-xs max-w-xs"
        data-testid={`admin-tags-input-${roadmap.slug}`}
      />
      <select
        value={level}
        onChange={(e) => setLevel(e.target.value)}
        className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white"
        data-testid={`admin-level-select-${roadmap.slug}`}
      >
        {LEVELS.map((entry) => <option key={entry} value={entry}>{getLevelLabel(t, entry)}</option>)}
      </select>
      <span className="text-[10px] text-slate-400 italic">
        {savedTick ? t("admin:roadmaps.saved") : t("admin:roadmaps.autoSaves")}
      </span>
    </div>
  );
}

export default function AdminRoadmaps() {
  const { user, loading } = useAuth();
  const { t } = useTranslation(["common", "admin", "roadmaps"]);
  const importInputRef = useRef(null);
  const [roadmaps, setRoadmaps] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", description: "", cover_emoji: "🗺️", status: "draft", tags: "", level: "mixed" });
  const [err, setErr] = useState("");
  const [selectedRoadmapIds, setSelectedRoadmapIds] = useState([]);
  const [exportingRoadmapId, setExportingRoadmapId] = useState(null);
  const [exportingSelection, setExportingSelection] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/roadmaps");
      setRoadmaps(data);
    } catch (e) {
      setErr(formatApiError(e, t("common:errors.generic")));
    }
  };

  useEffect(() => {
    if (user && (user.role === "admin" || user.role === "editor")) load();
  }, [user?.id]);

  useEffect(() => {
    setSelectedRoadmapIds((current) => current.filter((id) => roadmaps.some((entry) => entry.id === id)));
  }, [roadmaps]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "editor") return <Navigate to="/" replace />;

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const allSelected = roadmaps.length > 0 && roadmaps.every((entry) => selectedRoadmapIds.includes(entry.id));
  const isExportBusy = exportingSelection || exportingRoadmapId !== null;
  const isBusy = isExportBusy || importing;

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/roadmaps", form);
      setRoadmaps((prev) => [...prev, data]);
      setCreating(false);
      setForm({ slug: "", title: "", description: "", cover_emoji: "🗺️", status: "draft", tags: "", level: "mixed" });
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const setStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/roadmaps/${id}/status`, { status });
      setRoadmaps((prev) => prev.map((entry) => (entry.id === id ? data : entry)));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const saveMeta = async (id, changes) => {
    try {
      const { data } = await api.put(`/roadmaps/${id}`, changes);
      setRoadmaps((prev) => prev.map((entry) => (entry.id === id ? data : entry)));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const del = async (id, title) => {
    if (!window.confirm(t("admin:roadmaps.deleteConfirm", { title }))) return;
    try {
      await api.delete(`/roadmaps/${id}`);
      setRoadmaps((prev) => prev.filter((entry) => entry.id !== id));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const toggleSelectedRoadmap = (roadmapId) => {
    setSelectedRoadmapIds((current) => (
      current.includes(roadmapId)
        ? current.filter((id) => id !== roadmapId)
        : [...current, roadmapId]
    ));
  };

  const toggleSelectAll = () => {
    setSelectedRoadmapIds(allSelected ? [] : roadmaps.map((entry) => entry.id));
  };

  const exportRoadmaps = async (roadmapIds, fallbackFilename, selectionMode = false) => {
    if (!roadmapIds.length) return;
    if (selectionMode) setExportingSelection(true);
    else setExportingRoadmapId(roadmapIds[0]);
    try {
      const response = await api.post("/admin/roadmaps/export", {
        roadmap_ids: roadmapIds,
      }, {
        responseType: "blob",
      });
      const filename = parseFilename(response.headers?.["content-disposition"], fallbackFilename);
      triggerDownload(response.data, filename);
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    } finally {
      if (selectionMode) setExportingSelection(false);
      else setExportingRoadmapId(null);
    }
  };

  const openImportDialog = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    setImporting(true);
    try {
      const { data } = await api.post("/admin/roadmaps/import", formData);
      await load();
      const renamed = (data.roadmaps || []).filter((entry) => entry.slug_source !== entry.slug_final);
      const renameLine = renamed.length
        ? `\n${t("admin:roadmaps.importRenamed")}\n${renamed.map((entry) => `${entry.slug_source} -> ${entry.slug_final}`).join("\n")}`
        : "";
      alert(`${t("admin:roadmaps.importSuccess", { count: data.imported_count })}${renameLine}`);
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">// {t(`admin:roles.${user.role === "admin" ? "admin" : "editor"}`)}</div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">{t("admin:roadmaps.title")}</h1>
            <p className="mt-2 text-slate-600 text-sm">{t("admin:roadmaps.description")}</p>
          </div>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button data-testid="new-roadmap-btn"><Plus size={14} className="mr-1" /> {t("admin:roadmaps.newRoadmap")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">{t("admin:roadmaps.createRoadmap")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4" data-testid="new-roadmap-form">
                <div>
                  <Label>{t("admin:roadmaps.coverEmoji")}</Label>
                  <Input value={form.cover_emoji} maxLength={4} onChange={(e) => setField("cover_emoji", e.target.value)} data-testid="new-roadmap-emoji" />
                </div>
                <div>
                  <Label>{t("admin:roadmaps.slug")}</Label>
                  <Input value={form.slug} onChange={(e) => setField("slug", e.target.value.toLowerCase())} required pattern="^[-a-z0-9]+$" data-testid="new-roadmap-slug" />
                </div>
                <div>
                  <Label>{t("admin:roadmaps.titleField")}</Label>
                  <Input value={form.title} onChange={(e) => setField("title", e.target.value)} required data-testid="new-roadmap-title" />
                </div>
                <div>
                  <Label>{t("admin:roadmaps.descriptionField")}</Label>
                  <Textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={3} data-testid="new-roadmap-description" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("admin:roadmaps.level")}</Label>
                    <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.level} onChange={(e) => setField("level", e.target.value)} data-testid="new-roadmap-level">
                      {LEVELS.map((entry) => <option key={entry} value={entry}>{getLevelLabel(t, entry)}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>{t("admin:roadmaps.initialStatus")}</Label>
                    <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.status} onChange={(e) => setField("status", e.target.value)} data-testid="new-roadmap-status">
                      {STATUSES.map((status) => <option key={status} value={status}>{getRoadmapStatusLabel(t, status)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>{t("admin:roadmaps.tags")}</Label>
                  <Input value={form.tags} onChange={(e) => setField("tags", e.target.value.toLowerCase())} placeholder={t("admin:roadmaps.tagsPlaceholder")} data-testid="new-roadmap-tags" />
                </div>
                <Button type="submit" className="w-full" data-testid="new-roadmap-submit">{t("common:actions.create")}</Button>
              </form>
            </DialogContent>
          </Dialog>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            className="hidden"
            onChange={handleImportFile}
            data-testid="admin-import-file-input"
          />
          <Button type="button" variant="outline" onClick={openImportDialog} disabled={isBusy} data-testid="admin-import-btn">
            <Upload size={14} className="mr-1" /> {importing ? t("admin:roadmaps.importing") : t("admin:roadmaps.import")}
          </Button>
        </div>

        {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

        <div className="mt-8 flex items-center justify-between gap-3 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={toggleSelectAll}
            disabled={!roadmaps.length}
            data-testid="admin-select-all-roadmaps"
          >
            {allSelected ? t("admin:roadmaps.clearSelection") : t("admin:roadmaps.selectAll")}
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500" data-testid="admin-selected-count">
              {t("admin:roadmaps.selectedCount", { count: selectedRoadmapIds.length })}
            </span>
            <Button
              type="button"
              onClick={() => exportRoadmaps(selectedRoadmapIds, exportFallbackFilename(roadmaps, selectedRoadmapIds), true)}
              disabled={!selectedRoadmapIds.length || isBusy}
              data-testid="admin-export-selected"
            >
              <Download size={14} className="mr-1" /> {exportingSelection ? t("admin:roadmaps.exporting") : t("admin:roadmaps.exportSelected")}
            </Button>
          </div>
        </div>

        <div className="mt-10 space-y-3" data-testid="admin-roadmaps-list">
          {roadmaps.map((entry) => (
            <div key={entry.id} data-testid={`admin-roadmap-row-${entry.slug}`} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <input
                  type="checkbox"
                  checked={selectedRoadmapIds.includes(entry.id)}
                  onChange={() => toggleSelectedRoadmap(entry.id)}
                  className="h-4 w-4 rounded border-slate-300"
                  aria-label={t("admin:roadmaps.selectOne", { title: entry.title })}
                  data-testid={`admin-select-roadmap-${entry.slug}`}
                />
                <div className="text-2xl">{entry.cover_emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold text-slate-900 truncate">{entry.title}</h3>
                    <span className={`text-xs uppercase tracking-wider font-medium px-2 py-0.5 rounded ${STATUS_BADGE[entry.status]}`} data-testid={`admin-roadmap-status-${entry.slug}`}>{getRoadmapStatusLabel(t, entry.status)}</span>
                  </div>
                  <p className="text-sm text-slate-500 truncate">/{entry.slug} · {t("roadmaps:badges.blocks", { count: entry.block_count })}</p>
                </div>
                <select
                  value={entry.status}
                  onChange={(e) => setStatus(entry.id, e.target.value)}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
                  data-testid={`admin-status-select-${entry.slug}`}
                >
                  {STATUSES.map((status) => <option key={status} value={status}>{getRoadmapStatusLabel(t, status)}</option>)}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportRoadmaps([entry.id], `${entry.slug}.json`)}
                  disabled={isBusy}
                  data-testid={`admin-export-roadmap-${entry.slug}`}
                >
                  <Download size={14} className="mr-1" /> {exportingRoadmapId === entry.id ? t("admin:roadmaps.exporting") : t("admin:roadmaps.export")}
                </Button>
                <Link to={`/roadmaps/${entry.slug}`}>
                  <Button size="sm" variant="outline" data-testid={`admin-open-${entry.slug}`}>
                    <ExternalLink size={14} className="mr-1" /> {t("common:actions.open")}
                  </Button>
                </Link>
                {user.role === "admin" && (
                  <Button size="sm" variant="outline" onClick={() => del(entry.id, entry.title)} data-testid={`admin-delete-roadmap-${entry.slug}`}>
                    <Trash2 size={14} className="text-red-600" />
                  </Button>
                )}
              </div>
              <MetaEditor roadmap={entry} onSave={(changes) => saveMeta(entry.id, changes)} t={t} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
