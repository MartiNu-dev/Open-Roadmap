import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  getAlignmentLabel,
  getBlockStyleLabel,
  getCanvasFontSizeLabel,
  getLevelLabel,
  getPositionLabel,
  getProgressStatusLabel,
  getResourceKindLabel,
} from "@/i18n/formatters";
import { Circle, Loader2, Check, ExternalLink, BookOpen, Video, FileText, Trash2, Plus, GripVertical } from "lucide-react";

const REMARK_PLUGINS = [remarkGfm];
const RES_ICON = { article: FileText, video: Video, docs: BookOpen, course: BookOpen };
const RES_KINDS = ["article", "video", "docs", "course"];
const STYLE_OPTIONS = ["primary", "alternative", "optional", "label"];
const LEVEL_OPTIONS = ["", "beginner", "intermediate", "advanced"];
const GROUP_BG_PRESETS = ["#0f172a", "#1e293b", "#334155", "#1e3a8a", "#065f46", "#7c2d12", "#581c87", "#9f1239"];
const GROUP_BORDER_PRESETS = ["#94a3b8", "#475569", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];
const POSITIONS = ["top", "bottom"];
const ALIGNS = ["left", "center", "right"];
const VISIBILITY_MODES = ["visible", "transparent"];
const BORDER_STYLES = ["solid", "dashed", "dotted"];
const BORDER_THICKNESSES = ["small", "medium", "large"];
const FONT_SIZE_OPTIONS = ["xs", "sm", "base", "lg", "xl"];
const LABEL_SIDES = ["left", "right"];

function sortResources(resources = []) {
  return [...resources].sort((a, b) =>
    (a.order_index ?? 0) - (b.order_index ?? 0) || a.id.localeCompare(b.id)
  );
}

function reorderResourceIds(resourceIds, draggedId, targetId, position) {
  if (!draggedId || !targetId || draggedId === targetId) return resourceIds;
  const next = [...resourceIds];
  const fromIndex = next.indexOf(draggedId);
  const targetIndex = next.indexOf(targetId);
  if (fromIndex === -1 || targetIndex === -1) return resourceIds;

  next.splice(fromIndex, 1);
  const insertAt = targetIndex + (position === "after" ? 1 : 0) - (fromIndex < targetIndex ? 1 : 0);
  next.splice(insertAt, 0, draggedId);
  return next;
}

function ResourceRow({
  resource,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDropBefore,
  isDropAfter,
  canReorder,
  t,
}) {
  const [draft, setDraft] = useState({
    label: resource.label,
    url: resource.url,
    kind: resource.kind,
  });
  const initialRef = useRef(resource.id);

  useEffect(() => {
    if (initialRef.current !== resource.id) {
      initialRef.current = resource.id;
      setDraft({ label: resource.label, url: resource.url, kind: resource.kind });
    }
  }, [resource.id, resource.label, resource.url, resource.kind]);

  useEffect(() => {
    const changed =
      draft.label !== resource.label ||
      draft.url !== resource.url ||
      draft.kind !== resource.kind;
    if (!changed) return;
    if (!draft.label.trim() || !draft.url.trim()) return;
    const timeoutId = setTimeout(() => {
      onUpdate(resource.id, draft);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [draft, resource.id, resource.label, resource.url, resource.kind, onUpdate]);

  return (
    <div
      className={`relative rounded-md border border-slate-200 bg-white p-3 transition ${isDragging ? "opacity-60" : ""}`}
      data-testid={`resource-row-${resource.id}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDropBefore && <div className="absolute -top-1 left-3 right-3 h-0.5 rounded-full bg-slate-900" />}
      {isDropAfter && <div className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-slate-900" />}
      <div className="flex gap-3">
        <button
          type="button"
          draggable={canReorder}
          disabled={!canReorder}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className={`mt-0.5 shrink-0 rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-500 transition ${
            canReorder ? "cursor-grab hover:border-slate-300 hover:text-slate-700 active:cursor-grabbing" : "cursor-not-allowed opacity-50"
          }`}
          data-testid={`resource-drag-handle-${resource.id}`}
          title={t("blockPanel.dragToReorderResource")}
          aria-label={t("blockPanel.dragToReorderResource")}
        >
          <GripVertical size={16} />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <Input
              value={draft.label}
              placeholder={t("blockPanel.resourceLabel")}
              onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))}
              data-testid={`resource-label-${resource.id}`}
            />
            <select
              className="h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
              value={draft.kind}
              onChange={(e) => setDraft((current) => ({ ...current, kind: e.target.value }))}
              data-testid={`resource-kind-${resource.id}`}
            >
              {RES_KINDS.map((kind) => <option key={kind} value={kind}>{getResourceKindLabel(t, kind)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Input
              value={draft.url}
              placeholder="https://..."
              onChange={(e) => setDraft((current) => ({ ...current, url: e.target.value }))}
              data-testid={`resource-url-${resource.id}`}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(resource.id)}
              data-testid={`resource-delete-${resource.id}`}
              title={t("blockPanel.deleteResource")}
            >
              <Trash2 size={14} className="text-red-600" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BlockSidePanelDnD({
  open, onOpenChange, block, progress, onStatusChange, canEdit,
  canManage, onSave, onDelete, saving,
  onAddResource, onUpdateResource, onDeleteResource, onReorderResources,
}) {
  const { t } = useTranslation(["roadmaps", "common"]);
  const [form, setForm] = useState(null);
  const initialBlockIdRef = useRef(null);
  const [draggedResourceId, setDraggedResourceId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    if (block) {
      initialBlockIdRef.current = block.id;
      setForm({
        title: block.title,
        short_description: block.short_description || "",
        detailed_content: block.detailed_content || "",
        level: block.level || "",
        estimated_duration: block.estimated_duration || "",
        node_style: block.node_style || "primary",
        visibility_mode: block.visibility_mode || "visible",
        bg_color: block.bg_color || "#0f172a",
        border_color: block.border_color || "#94a3b8",
        border_style: block.border_style || "solid",
        border_thickness: block.border_thickness || "small",
        label_position: block.label_position || "bottom",
        label_align: block.label_align || "center",
        checkbox_color: block.checkbox_color || "#111827",
        text_color: block.text_color || "#0f172a",
        font_size: block.font_size || "base",
        font_size_px: block.font_size_px ?? null,
        label_side: block.label_side || "right",
      });
    }
  }, [block?.id]);

  useEffect(() => {
    setDraggedResourceId(null);
    setDropTarget(null);
  }, [block?.id, open]);

  useEffect(() => {
    if (!form || !block || !canManage) return;
    if (initialBlockIdRef.current !== block.id) return;
    const changed = (form.title !== block.title)
      || (form.short_description !== (block.short_description || ""))
      || (form.detailed_content !== (block.detailed_content || ""))
      || (form.level !== (block.level || ""))
      || (form.estimated_duration !== (block.estimated_duration || ""))
      || (form.node_style !== (block.node_style || "primary"))
      || (form.visibility_mode !== (block.visibility_mode || "visible"))
      || (form.bg_color !== (block.bg_color || "#0f172a"))
      || (form.border_color !== (block.border_color || "#94a3b8"))
      || (form.border_style !== (block.border_style || "solid"))
      || (form.border_thickness !== (block.border_thickness || "small"))
      || (form.label_position !== (block.label_position || "bottom"))
      || (form.label_align !== (block.label_align || "center"))
      || (form.checkbox_color !== (block.checkbox_color || "#111827"))
      || (form.text_color !== (block.text_color || "#0f172a"))
      || (form.font_size !== (block.font_size || "base"))
      || ((form.font_size_px ?? null) !== (block.font_size_px ?? null))
      || (form.label_side !== (block.label_side || "right"));
    if (!changed) return;

    const isGroup = block.kind === "group";
    if (!isGroup && (!form.title || !form.title.trim())) return;
    if (block.kind === "text" && form.font_size === "custom" && !form.font_size_px) return;
    const timeoutId = setTimeout(() => onSave?.(form), 500);
    return () => clearTimeout(timeoutId);
  }, [form, canManage, block, onSave]);

  if (!block || !form) return null;

  const isTrackableBlock = block.kind === "block" || block.kind === "checkbox";
  const isCheckbox = block.kind === "checkbox";
  const isText = block.kind === "text";
  const panelTitle = isText ? t("blockPanel.freeText") : (block.title || (block.kind === "group" ? t("blockPanel.untitledGroup") : ""));
  const status = progress?.status || "not_started";
  const resources = sortResources(block.resources || []);
  const canReorderResources = canManage && resources.length > 1 && typeof onReorderResources === "function";

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const clearResourceDrag = () => {
    setDraggedResourceId(null);
    setDropTarget(null);
  };
  const getDropPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  const handleResourceDragStart = (event, resourceId) => {
    if (!canReorderResources) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", resourceId);
    setDraggedResourceId(resourceId);
    setDropTarget(null);
  };
  const handleResourceDragOver = (event, resourceId) => {
    if (!draggedResourceId || !canReorderResources) return;
    event.preventDefault();
    if (draggedResourceId === resourceId) {
      setDropTarget(null);
      return;
    }
    const position = getDropPosition(event);
    setDropTarget((prev) => (
      prev?.resourceId === resourceId && prev?.position === position
        ? prev
        : { resourceId, position }
    ));
  };
  const handleResourceDrop = (event, resourceId) => {
    if (!canReorderResources) return;
    event.preventDefault();
    const activeId = draggedResourceId || event.dataTransfer.getData("text/plain");
    const position = getDropPosition(event);
    const orderedIds = reorderResourceIds(resources.map((resource) => resource.id), activeId, resourceId, position);
    clearResourceDrag();
    if (orderedIds.every((id, index) => id === resources[index]?.id)) return;
    onReorderResources(block.id, orderedIds);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] overflow-y-auto p-0 flex flex-col" data-testid="side-panel">
        <div className="border-b border-slate-200 p-6">
          <SheetHeader>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-500">
              {block.level && <span className="rounded bg-slate-100 px-2 py-0.5">{getLevelLabel(t, block.level)}</span>}
              {block.estimated_duration && <span>~ {block.estimated_duration}</span>}
              {isTrackableBlock && (
                <span className={
                  status === "completed" ? "text-emerald-600"
                  : status === "in_progress" ? "text-blue-600"
                  : "text-slate-500"
                }>{getProgressStatusLabel(t, status)}</span>
              )}
            </div>
            <SheetTitle className="font-display text-2xl text-left text-slate-900">{panelTitle}</SheetTitle>
            {block.short_description && (
              <SheetDescription className="text-left text-slate-600">{block.short_description}</SheetDescription>
            )}
          </SheetHeader>
        </div>

        <div className="flex-1 p-6 space-y-8">
          {canManage ? (
            block.kind === "group" ? (
              <div className="space-y-4" data-testid="group-editor-form">
                <div>
                  <Label>{t("blockPanel.labelOptional")}</Label>
                  <Input value={form.title} onChange={(e) => setField("title", e.target.value)} data-testid="edit-group-title" />
                </div>
                <div>
                  <Label>{t("blockPanel.visibility")}</Label>
                  <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                    value={form.visibility_mode}
                    onChange={(e) => setField("visibility_mode", e.target.value)}
                    data-testid="edit-group-visibility-mode">
                    {VISIBILITY_MODES.map((mode) => <option key={mode} value={mode}>{t(`blockPanel.visibilityModes.${mode}`)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>{t("blockPanel.backgroundColor")}</Label>
                  <div className="flex flex-wrap gap-2 mt-1" data-testid="group-bg-presets">
                    {GROUP_BG_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setField("bg_color", color)}
                        className={`w-7 h-7 rounded-md border-2 transition ${form.bg_color === color ? "border-slate-900 scale-110" : "border-slate-200"}`}
                        style={{ background: color }}
                        data-testid={`group-bg-${color.replace("#", "")}`}
                        aria-label={`${t("blockPanel.backgroundColor")} ${color}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.bg_color}
                      onChange={(e) => setField("bg_color", e.target.value)}
                      className="w-7 h-7 rounded-md border-2 border-slate-200 cursor-pointer"
                      data-testid="group-bg-picker"
                    />
                  </div>
                </div>
                <div>
                  <Label>{t("blockPanel.borderColor")}</Label>
                  <div className="flex flex-wrap gap-2 mt-1 items-center" data-testid="group-border-presets">
                    {GROUP_BORDER_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setField("border_color", color)}
                        className={`w-7 h-7 rounded-md border-2 transition ${form.border_color === color ? "border-slate-900 scale-110" : "border-slate-200"}`}
                        style={{ background: color }}
                        data-testid={`group-border-${color.replace("#", "")}`}
                        aria-label={`${t("blockPanel.borderColor")} ${color}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.border_color}
                      onChange={(e) => setField("border_color", e.target.value)}
                      className="w-7 h-7 rounded-md border-2 border-slate-200 cursor-pointer"
                      data-testid="group-border-picker"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("blockPanel.borderStyle")}</Label>
                    <div className="mt-1 flex gap-2">
                      {BORDER_STYLES.map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setField("border_style", style)}
                          data-testid={`group-border-style-${style}`}
                          className={`px-3 py-1 text-xs rounded-md border ${form.border_style === style ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
                        >
                          {t(`blockPanel.borderStyles.${style}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>{t("blockPanel.borderThickness")}</Label>
                    <div className="mt-1 flex gap-2">
                      {BORDER_THICKNESSES.map((thickness) => (
                        <button
                          key={thickness}
                          type="button"
                          onClick={() => setField("border_thickness", thickness)}
                          data-testid={`group-border-thickness-${thickness}`}
                          className={`px-3 py-1 text-xs rounded-md border ${form.border_thickness === thickness ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
                        >
                          {t(`blockPanel.borderThicknesses.${thickness}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("blockPanel.labelPosition")}</Label>
                    <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.label_position}
                      onChange={(e) => setField("label_position", e.target.value)}
                      data-testid="edit-group-label-position">
                      {POSITIONS.map((position) => <option key={position} value={position}>{getPositionLabel(t, position)}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>{t("blockPanel.textAlignment")}</Label>
                    <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.label_align}
                      onChange={(e) => setField("label_align", e.target.value)}
                      data-testid="edit-group-label-align">
                      {ALIGNS.map((align) => <option key={align} value={align}>{getAlignmentLabel(t, align)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 items-center">
                  <span className="text-xs text-slate-500 italic">{saving ? t("blockPanel.saving") : t("blockPanel.autoSaves")}</span>
                  <Button variant="outline" onClick={onDelete} data-testid="edit-group-delete-btn" className="ml-auto">
                    <Trash2 size={14} className="mr-1 text-red-600" /> {t("blockPanel.deleteGroup")}
                  </Button>
                </div>
              </div>
            ) : isCheckbox ? (
              <div className="space-y-4" data-testid="checkbox-editor-form">
                <div>
                  <Label>{t("blockPanel.checkboxText")}</Label>
                  <Input value={form.title} onChange={(e) => setField("title", e.target.value)} data-testid="edit-checkbox-title" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("blockPanel.checkboxColor")}</Label>
                    <input
                      type="color"
                      value={form.checkbox_color}
                      onChange={(e) => setField("checkbox_color", e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white p-1 cursor-pointer"
                      data-testid="edit-checkbox-color"
                    />
                  </div>
                  <div>
                    <Label>{t("blockPanel.textColor")}</Label>
                    <input
                      type="color"
                      value={form.text_color}
                      onChange={(e) => setField("text_color", e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white p-1 cursor-pointer"
                      data-testid="edit-checkbox-text-color"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("blockPanel.fontSize")}</Label>
                    <select
                      className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.font_size}
                      onChange={(e) => setField("font_size", e.target.value)}
                      data-testid="edit-checkbox-font-size"
                    >
                      {FONT_SIZE_OPTIONS.map((fontSize) => (
                        <option key={fontSize} value={fontSize}>{getCanvasFontSizeLabel(t, fontSize)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("blockPanel.labelSide")}</Label>
                    <select
                      className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.label_side}
                      onChange={(e) => setField("label_side", e.target.value)}
                      data-testid="edit-checkbox-label-side"
                    >
                      {LABEL_SIDES.map((side) => (
                        <option key={side} value={side}>{getPositionLabel(t, side)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 items-center">
                  <span className="text-xs text-slate-500 italic">{saving ? t("blockPanel.saving") : t("blockPanel.autoSaves")}</span>
                  <Button variant="outline" onClick={onDelete} data-testid="edit-checkbox-delete-btn" className="ml-auto">
                    <Trash2 size={14} className="mr-1 text-red-600" /> {t("blockPanel.deleteCheckbox")}
                  </Button>
                </div>
              </div>
            ) : isText ? (
              <div className="space-y-4" data-testid="text-editor-form">
                <div>
                  <Label>{t("blockPanel.textContent")}</Label>
                  <Textarea
                    rows={6}
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    data-testid="edit-text-content"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("blockPanel.textColor")}</Label>
                    <input
                      type="color"
                      value={form.text_color}
                      onChange={(e) => setField("text_color", e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white p-1 cursor-pointer"
                      data-testid="edit-text-color"
                    />
                  </div>
                  <div>
                    <Label>{t("blockPanel.textAlignment")}</Label>
                    <select
                      className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.label_align}
                      onChange={(e) => setField("label_align", e.target.value)}
                      data-testid="edit-text-align"
                    >
                      {ALIGNS.concat("justify").map((align) => (
                        <option key={align} value={align}>{getAlignmentLabel(t, align)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("blockPanel.fontSize")}</Label>
                    <select
                      className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.font_size}
                      onChange={(e) => setField("font_size", e.target.value)}
                      data-testid="edit-text-font-size"
                    >
                      {FONT_SIZE_OPTIONS.concat("custom").map((fontSize) => (
                        <option key={fontSize} value={fontSize}>{getCanvasFontSizeLabel(t, fontSize)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("blockPanel.customFontSizePx")}</Label>
                    <Input
                      type="number"
                      min="8"
                      max="160"
                      value={form.font_size_px ?? ""}
                      disabled={form.font_size !== "custom"}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setField("font_size_px", nextValue ? Number(nextValue) : null);
                      }}
                      data-testid="edit-text-font-size-px"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2 items-center">
                  <span className="text-xs text-slate-500 italic">{saving ? t("blockPanel.saving") : t("blockPanel.autoSaves")}</span>
                  <Button variant="outline" onClick={onDelete} data-testid="edit-text-delete-btn" className="ml-auto">
                    <Trash2 size={14} className="mr-1 text-red-600" /> {t("blockPanel.deleteText")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4" data-testid="block-editor-form">
                  <div>
                    <Label>{t("blockPanel.title")}</Label>
                    <Input value={form.title} onChange={(e) => setField("title", e.target.value)} data-testid="edit-block-title" />
                  </div>
                  <div>
                    <Label>{t("blockPanel.shortDescription")}</Label>
                    <Input value={form.short_description} onChange={(e) => setField("short_description", e.target.value)} data-testid="edit-block-short" />
                  </div>
                  <div>
                    <Label>{t("blockPanel.detailedContent")}</Label>
                    <Textarea rows={5} value={form.detailed_content} onChange={(e) => setField("detailed_content", e.target.value)} data-testid="edit-block-detail" />
                    <p className="text-xs text-slate-500 mt-1">{t("blockPanel.markdownHelp")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("blockPanel.level")}</Label>
                      <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                        value={form.level} onChange={(e) => setField("level", e.target.value)} data-testid="edit-block-level">
                        {LEVEL_OPTIONS.map((level) => <option key={level || "none"} value={level}>{getLevelLabel(t, level)}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>{t("blockPanel.duration")}</Label>
                      <Input value={form.estimated_duration} onChange={(e) => setField("estimated_duration", e.target.value)} placeholder={t("blockPanel.durationPlaceholder")} data-testid="edit-block-duration" />
                    </div>
                  </div>
                  <div>
                    <Label>{t("blockPanel.blockStyle")}</Label>
                    <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                      value={form.node_style} onChange={(e) => setField("node_style", e.target.value)} data-testid="edit-block-style">
                      {STYLE_OPTIONS.map((style) => <option key={style} value={style}>{getBlockStyleLabel(t, style)}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2 items-center">
                    <span className="text-xs text-slate-500 italic">{saving ? t("blockPanel.saving") : t("blockPanel.autoSaves")}</span>
                    <Button variant="outline" onClick={onDelete} data-testid="edit-block-delete-btn" className="ml-auto">
                      <Trash2 size={14} className="mr-1 text-red-600" /> {t("blockPanel.deleteBlock")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3" data-testid="block-editor-resources">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500">{t("blockPanel.resources")}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAddResource?.(block.id)}
                      data-testid="resource-add-btn"
                    >
                      <Plus size={14} className="mr-1" /> {t("blockPanel.add")}
                    </Button>
                  </div>
                  {resources.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">{t("blockPanel.noResources")}</p>
                  ) : (
                    <div className="space-y-2">
                      {resources.map((resource) => (
                        <ResourceRow
                          key={resource.id}
                          resource={resource}
                          onUpdate={onUpdateResource}
                          onDelete={onDeleteResource}
                          onDragStart={(event) => handleResourceDragStart(event, resource.id)}
                          onDragOver={(event) => handleResourceDragOver(event, resource.id)}
                          onDrop={(event) => handleResourceDrop(event, resource.id)}
                          onDragEnd={clearResourceDrag}
                          isDragging={draggedResourceId === resource.id}
                          isDropBefore={dropTarget?.resourceId === resource.id && dropTarget?.position === "before"}
                          isDropAfter={dropTarget?.resourceId === resource.id && dropTarget?.position === "after"}
                          canReorder={canReorderResources}
                          t={t}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )
          ) : (
            <>
              {block.detailed_content && (
                <div>
                  <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">{t("blockPanel.overview")}</h4>
                  <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed" data-testid="block-content-markdown">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{block.detailed_content}</ReactMarkdown>
                  </div>
                </div>
              )}
              {resources.length > 0 && (
                <div>
                  <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">{t("blockPanel.resources")}</h4>
                  <ul className="space-y-2" data-testid="side-panel-resources">
                    {resources.map((resource) => {
                      const Icon = RES_ICON[resource.kind] || FileText;
                      return (
                        <li key={resource.id}>
                          <a href={resource.url} target="_blank" rel="noopener noreferrer"
                            className="group flex items-center gap-3 border border-slate-200 rounded-md p-3 hover:border-slate-900 transition-colors">
                            <Icon size={16} className="text-slate-500 shrink-0" />
                            <span className="flex-1 text-sm text-slate-700 truncate">{resource.label}</span>
                            <ExternalLink size={14} className="text-slate-400 group-hover:text-slate-900" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {!canManage && isTrackableBlock && (canEdit ? (
          <div className="border-t border-slate-200 p-6 bg-slate-50 sticky bottom-0">
            <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">{t("blockPanel.updateProgress")}</h4>
            <div className="grid grid-cols-3 gap-2">
              <Button variant={status === "not_started" ? "default" : "outline"} size="sm" onClick={() => onStatusChange("not_started")} data-testid="status-btn-not-started" className="rounded-md">
                <Circle size={14} className="mr-1" /> {t("blockPanel.reset")}
              </Button>
              <Button variant={status === "in_progress" ? "default" : "outline"} size="sm" onClick={() => onStatusChange("in_progress")} data-testid="status-btn-in-progress" className={`rounded-md ${status === "in_progress" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}>
                <Loader2 size={14} className="mr-1" /> {t("blockPanel.doing")}
              </Button>
              <Button variant={status === "completed" ? "default" : "outline"} size="sm" onClick={() => onStatusChange("completed")} data-testid="status-btn-complete" className={`rounded-md ${status === "completed" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}>
                <Check size={14} className="mr-1" /> {t("blockPanel.done")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-200 p-6 bg-slate-50 text-sm text-slate-600">
            {t("blockPanel.loginToTrack")}
          </div>
        ))}
      </SheetContent>
    </Sheet>
  );
}
