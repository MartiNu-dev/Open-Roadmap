import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { formatApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import BlockSidePanel from "@/components/BlockSidePanel";
import LinkSidePanel from "@/components/LinkSidePanel";
import RoadmapCanvas from "@/components/RoadmapCanvas";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Eye } from "lucide-react";

function sortResources(resources = []) {
  return [...resources].sort((a, b) =>
    (a.order_index ?? 0) - (b.order_index ?? 0) || a.id.localeCompare(b.id)
  );
}

function buildOrderedResources(resources = [], orderedIds = []) {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  return orderedIds.reduce((ordered, resourceId, index) => {
    const resource = byId.get(resourceId);
    if (!resource) return ordered;
    ordered.push({ ...resource, order_index: index + 1 });
    return ordered;
  }, []);
}

function replaceBlockResources(roadmap, blockId, resources) {
  if (!roadmap) return roadmap;
  return {
    ...roadmap,
    blocks: roadmap.blocks.map((block) => (
      block.id === blockId ? { ...block, resources: sortResources(resources) } : block
    )),
  };
}

export default function RoadmapDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation(["common", "roadmaps"]);
  const [roadmap, setRoadmap] = useState(null);
  const [progressItems, setProgressItems] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedLink, setSelectedLink] = useState(null);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);

  const isEditor = !!user && (user.role === "admin" || user.role === "editor");

  const loadRoadmap = async () => {
    const { data } = await api.get(`/roadmaps/${slug}`);
    setRoadmap(data);
  };

  const loadProgress = async (roadmapId) => {
    if (!user) { setProgressItems([]); return; }
    try {
      const { data } = await api.get(`/progress/me/${roadmapId}`);
      setProgressItems(data.items);
    } catch (err) {
      console.error("Failed to load progress:", err);
    }
  };

  useEffect(() => { loadRoadmap(); }, [slug]);
  useEffect(() => { if (roadmap) loadProgress(roadmap.id); }, [roadmap?.id, user?.id]);

  const progressByBlock = useMemo(() => {
    const map = {};
    for (const item of progressItems) map[item.block_id] = item;
    return map;
  }, [progressItems]);

  const total = roadmap?.blocks.length || 0;
  const completed = progressItems.filter((item) => item.status === "completed").length;
  const inProgress = progressItems.filter((item) => item.status === "in_progress").length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  const selectedBlock = roadmap?.blocks.find((block) => block.id === selectedBlockId) || null;
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
    setProgressItems((prev) => [...prev.filter((item) => item.block_id !== data.block_id), data]);
  };

  const handleMoveBlock = async (blockId, x, y) => {
    try {
      const { data } = await api.patch(`/blocks/${blockId}/position`, { x, y });
      setRoadmap((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, ...data } : block)),
      }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleCreateLink = async (payload) => {
    const body = typeof payload === "object" && payload.from_block_id
      ? { style: "solid", ...payload }
      : { from_block_id: arguments[0], to_block_id: arguments[1], style: "solid", from_side: "bottom", to_side: "top" };
    try {
      const { data } = await api.post(`/roadmaps/${roadmap.id}/links`, body);
      setRoadmap((current) => ({ ...current, links: [...current.links, data] }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleDeleteLink = async (linkId) => {
    if (!window.confirm(t("roadmaps:detail.deleteLinkConfirm"))) return;
    try {
      await api.delete(`/links/${linkId}`);
      setRoadmap((current) => ({ ...current, links: current.links.filter((link) => link.id !== linkId) }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleAddBlockAt = async (x, y) => {
    try {
      const { data } = await api.post(`/roadmaps/${roadmap.id}/blocks`, {
        title: "Block", short_description: "", detailed_content: "",
        level: "", estimated_duration: "", node_style: "primary",
        x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), width: 220, height: 44,
      });
      setRoadmap((current) => ({ ...current, blocks: [...current.blocks, data] }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleAddGroupAt = async (x, y) => {
    try {
      const { data } = await api.post(`/roadmaps/${roadmap.id}/blocks`, {
        title: "Group", short_description: "", detailed_content: "",
        level: "", estimated_duration: "", node_style: "primary",
        kind: "group", bg_color: "#0f172a", label_position: "bottom", label_align: "center",
        x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), width: 360, height: 200,
      });
      setRoadmap((current) => ({ ...current, blocks: [...current.blocks, data] }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleResizeBlock = async (blockId, x, y, width, height) => {
    try {
      const { data } = await api.patch(`/blocks/${blockId}/position`, { x, y, width, height });
      setRoadmap((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, ...data } : block)),
      }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleSelectLink = (link) => {
    setSelectedLink(link);
    setLinkPanelOpen(true);
  };

  const handleSaveLink = async (changes) => {
    if (!selectedLink) return;
    try {
      const { data } = await api.patch(`/links/${selectedLink.id}`, changes);
      setRoadmap((current) => ({ ...current, links: current.links.map((link) => (link.id === data.id ? data : link)) }));
      setSelectedLink(data);
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleDeleteSelectedLink = async () => {
    if (!selectedLink || !window.confirm(t("roadmaps:detail.deleteLinkConfirm"))) return;
    try {
      await api.delete(`/links/${selectedLink.id}`);
      setRoadmap((current) => ({ ...current, links: current.links.filter((link) => link.id !== selectedLink.id) }));
      setLinkPanelOpen(false);
      setSelectedLink(null);
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleSaveBlock = async (changes) => {
    if (!selectedBlock) return;
    setEditing(true);
    try {
      const payload = { ...selectedBlock, ...changes };
      const { data } = await api.put(`/blocks/${selectedBlock.id}`, payload);
      setRoadmap((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === data.id ? { ...block, ...data } : block)),
      }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (!selectedBlock || !window.confirm(t("roadmaps:detail.deleteBlockConfirm", { title: selectedBlock.title }))) return;
    try {
      await api.delete(`/blocks/${selectedBlock.id}`);
      setRoadmap((current) => ({
        ...current,
        blocks: current.blocks.filter((block) => block.id !== selectedBlock.id),
        links: current.links.filter((link) => link.from_block_id !== selectedBlock.id && link.to_block_id !== selectedBlock.id),
      }));
      setPanelOpen(false);
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleAddResource = async (blockId) => {
    try {
      const { data } = await api.post(`/blocks/${blockId}/resources`, {
        label: "New resource", url: "https://", kind: "article",
      });
      setRoadmap((current) => replaceBlockResources(current, blockId, [...(current.blocks.find((block) => block.id === blockId)?.resources || []), data]));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleUpdateResource = async (resourceId, changes) => {
    try {
      const { data } = await api.patch(`/resources/${resourceId}`, changes);
      setRoadmap((current) => ({
        ...current,
        blocks: current.blocks.map((block) => ({
          ...block,
          resources: sortResources((block.resources || []).map((resource) => (resource.id === data.id ? data : resource))),
        })),
      }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleReorderResources = async (blockId, orderedResourceIds) => {
    const previousResources = sortResources(
      roadmap?.blocks.find((block) => block.id === blockId)?.resources || []
    );
    const optimisticResources = buildOrderedResources(previousResources, orderedResourceIds);
    setRoadmap((current) => replaceBlockResources(current, blockId, optimisticResources));

    try {
      const { data } = await api.patch(`/blocks/${blockId}/resources/reorder`, {
        resource_ids: orderedResourceIds,
      });
      setRoadmap((current) => replaceBlockResources(current, blockId, data));
    } catch (e) {
      setRoadmap((current) => replaceBlockResources(current, blockId, previousResources));
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!window.confirm(t("roadmaps:detail.deleteResourceConfirm"))) return;
    try {
      await api.delete(`/resources/${resourceId}`);
      setRoadmap((current) => ({
        ...current,
        blocks: current.blocks.map((block) => ({
          ...block,
          resources: (block.resources || []).filter((resource) => resource.id !== resourceId),
        })),
      }));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  if (!roadmap) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="max-w-6xl mx-auto px-6 py-16 text-slate-500" data-testid="roadmap-loading">{t("roadmaps:detail.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 pt-8 pb-4">
        <Link to="/roadmaps" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={14} className="mr-1" /> {t("roadmaps:detail.allRoadmaps")}
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
                  {t("roadmaps:detail.progressCount", { completed, total })}
                </span>
                <span className="font-medium text-slate-900" data-testid="progress-percent">{percent}%</span>
              </div>
              <Progress value={percent} className="h-2" data-testid="progress-bar" />
              {inProgress > 0 && <div className="text-xs text-blue-600 mt-1">{t("roadmaps:badges.inProgress", { count: inProgress })}</div>}
            </div>
          )}
          {isEditor && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={() => setEditMode((value) => !value)}
              data-testid="toggle-edit-mode-btn"
            >
              {editMode ? <><Eye size={14} className="mr-1" /> {t("roadmaps:detail.viewer")}</> : <><Pencil size={14} className="mr-1" /> {t("roadmaps:detail.editCanvas")}</>}
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!user && (
          <div className="mb-6 border border-slate-200 bg-slate-50 rounded-md p-4 text-sm">
            <Link to="/login" className="underline font-medium">{t("roadmaps:detail.login")}</Link> {t("common:connectors.or")}{" "}
            <Link to="/register" className="underline font-medium">{t("roadmaps:detail.createAccount")}</Link> {t("roadmaps:detail.trackProgressSuffix")}
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
          onSelectLink={handleSelectLink}
          onAddBlockAt={handleAddBlockAt}
          onAddGroupAt={handleAddGroupAt}
          onResizeBlock={handleResizeBlock}
        />
      </div>

      <LinkSidePanel
        open={linkPanelOpen}
        onOpenChange={setLinkPanelOpen}
        link={selectedLink}
        onSave={handleSaveLink}
        onDelete={handleDeleteSelectedLink}
      />

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
        onAddResource={handleAddResource}
        onUpdateResource={handleUpdateResource}
        onDeleteResource={handleDeleteResource}
        onReorderResources={handleReorderResources}
      />
    </div>
  );
}
