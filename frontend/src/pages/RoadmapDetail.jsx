import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import BlockSidePanel from "@/components/BlockSidePanel";
import RoadmapCanvas from "@/components/RoadmapCanvas";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Eye } from "lucide-react";

export default function RoadmapDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [roadmap, setRoadmap] = useState(null);
  const [progressItems, setProgressItems] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(false);

  const isEditor = !!user && (user.role === "admin" || user.role === "editor");

  const loadRoadmap = async () => {
    const { data } = await api.get(`/roadmaps/${slug}`);
    setRoadmap(data);
  };

  const loadProgress = async (rid) => {
    if (!user) { setProgressItems([]); return; }
    try {
      const { data } = await api.get(`/progress/me/${rid}`);
      setProgressItems(data.items);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadRoadmap(); }, [slug]);
  useEffect(() => { if (roadmap) loadProgress(roadmap.id); }, [roadmap?.id, user?.id]);

  const progressByBlock = useMemo(() => {
    const m = {};
    for (const p of progressItems) m[p.block_id] = p;
    return m;
  }, [progressItems]);

  const total = roadmap?.blocks.length || 0;
  const completed = progressItems.filter((p) => p.status === "completed").length;
  const inProgress = progressItems.filter((p) => p.status === "in_progress").length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  const selectedBlock = roadmap?.blocks.find((b) => b.id === selectedBlockId) || null;
  const selectedProgress = selectedBlockId ? progressByBlock[selectedBlockId] : null;

  const openBlock = (block) => {
    setSelectedBlockId(block.id);
    setPanelOpen(true);
  };

  const handleStatusChange = async (status) => {
    if (!user || !selectedBlock || !roadmap) return;
    const { data } = await api.post("/progress", {
      roadmap_id: roadmap.id, block_id: selectedBlock.id, status,
    });
    setProgressItems((prev) => [...prev.filter((p) => p.block_id !== data.block_id), data]);
  };

  const handleMoveBlock = async (blockId, x, y) => {
    try {
      const { data } = await api.patch(`/blocks/${blockId}/position`, { x, y });
      setRoadmap((rm) => ({
        ...rm,
        blocks: rm.blocks.map((b) => (b.id === blockId ? { ...b, ...data } : b)),
      }));
    } catch (e) { alert(formatApiError(e)); }
  };

  const handleCreateLink = async (fromId, toId) => {
    try {
      const { data } = await api.post(`/roadmaps/${roadmap.id}/links`, {
        from_block_id: fromId, to_block_id: toId, style: "solid",
      });
      setRoadmap((rm) => ({ ...rm, links: [...rm.links, data] }));
    } catch (e) { alert(formatApiError(e)); }
  };

  const handleDeleteLink = async (linkId) => {
    if (!window.confirm("Delete this link?")) return;
    try {
      await api.delete(`/links/${linkId}`);
      setRoadmap((rm) => ({ ...rm, links: rm.links.filter((l) => l.id !== linkId) }));
    } catch (e) { alert(formatApiError(e)); }
  };

  const handleAddBlock = async () => {
    const title = window.prompt("New block title?");
    if (!title) return;
    try {
      const { data } = await api.post(`/roadmaps/${roadmap.id}/blocks`, {
        title, short_description: "", detailed_content: "",
        level: "beginner", estimated_duration: "", node_style: "primary",
        x: 320, y: 80, width: 220, height: 64,
      });
      setRoadmap((rm) => ({ ...rm, blocks: [...rm.blocks, data] }));
    } catch (e) { alert(formatApiError(e)); }
  };

  const handleSaveBlock = async (changes) => {
    if (!selectedBlock) return;
    setEditing(true);
    try {
      const payload = { ...selectedBlock, ...changes };
      const { data } = await api.put(`/blocks/${selectedBlock.id}`, payload);
      setRoadmap((rm) => ({
        ...rm,
        blocks: rm.blocks.map((b) => (b.id === data.id ? { ...b, ...data } : b)),
      }));
    } catch (e) { alert(formatApiError(e)); }
    finally { setEditing(false); }
  };

  const handleDeleteBlock = async () => {
    if (!selectedBlock || !window.confirm(`Delete block "${selectedBlock.title}"?`)) return;
    try {
      await api.delete(`/blocks/${selectedBlock.id}`);
      setRoadmap((rm) => ({
        ...rm,
        blocks: rm.blocks.filter((b) => b.id !== selectedBlock.id),
        links: rm.links.filter((l) => l.from_block_id !== selectedBlock.id && l.to_block_id !== selectedBlock.id),
      }));
      setPanelOpen(false);
    } catch (e) { alert(formatApiError(e)); }
  };

  if (!roadmap) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="max-w-6xl mx-auto px-6 py-16 text-slate-500" data-testid="roadmap-loading">Loading roadmap…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 pt-8 pb-4">
        <Link to="/roadmaps" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={14} className="mr-1" /> All roadmaps
        </Link>
      </div>

      <div className="sticky top-16 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6 flex-wrap">
          <div className="text-3xl">{roadmap.cover_emoji}</div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 truncate" data-testid="roadmap-title">
              {roadmap.title}
            </h1>
            <p className="text-sm text-slate-500 truncate">{roadmap.description}</p>
          </div>
          {user && (
            <div className="hidden sm:block w-56">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500 font-mono" data-testid="progress-count">
                  {completed}/{total} completed
                </span>
                <span className="font-medium text-slate-900" data-testid="progress-percent">{percent}%</span>
              </div>
              <Progress value={percent} className="h-2" data-testid="progress-bar" />
              {inProgress > 0 && <div className="text-xs text-blue-600 mt-1">{inProgress} in progress</div>}
            </div>
          )}
          {isEditor && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={() => setEditMode((v) => !v)}
              data-testid="toggle-edit-mode-btn"
            >
              {editMode ? <><Eye size={14} className="mr-1" /> Viewer</> : <><Pencil size={14} className="mr-1" /> Edit canvas</>}
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!user && (
          <div className="mb-6 border border-slate-200 bg-slate-50 rounded-md p-4 text-sm">
            <Link to="/login" className="underline font-medium">Log in</Link> or
            {" "}<Link to="/register" className="underline font-medium">create an account</Link> to track your progress.
          </div>
        )}

        <RoadmapCanvas
          roadmap={roadmap}
          progressByBlock={progressByBlock}
          isEditor={isEditor}
          editMode={editMode}
          onSelectBlock={openBlock}
          onMoveBlock={handleMoveBlock}
          onCreateLink={handleCreateLink}
          onDeleteLink={handleDeleteLink}
          onAddBlock={handleAddBlock}
        />
      </div>

      <BlockSidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        block={selectedBlock}
        progress={selectedProgress}
        onStatusChange={handleStatusChange}
        canEdit={!!user}
        canManage={isEditor && editMode}
        onSave={handleSaveBlock}
        onDelete={handleDeleteBlock}
        saving={editing}
      />
    </div>
  );
}
