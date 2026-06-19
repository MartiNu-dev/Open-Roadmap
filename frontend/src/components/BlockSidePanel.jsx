import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Circle, Loader2, Check, ExternalLink, BookOpen, Video, FileText, Trash2, Save } from "lucide-react";

const STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const RES_ICON = { article: FileText, video: Video, docs: BookOpen, course: BookOpen };

const STYLE_OPTIONS = [
  { value: "primary", label: "Primary (yellow)" },
  { value: "alternative", label: "Alternative (orange)" },
  { value: "optional", label: "Optional (violet)" },
  { value: "label", label: "Label (no border)" },
];

const LEVEL_OPTIONS = ["", "beginner", "intermediate", "advanced"];

export default function BlockSidePanel({
  open, onOpenChange, block, progress, onStatusChange, canEdit,
  canManage, onSave, onDelete, saving,
}) {
  const [form, setForm] = useState(null);
  const initialBlockIdRef = useRef(null);

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
      });
    }
  }, [block?.id]);

  // Auto-save on edits (debounced) — only when in manage mode
  useEffect(() => {
    if (!form || !block || !canManage) return;
    if (initialBlockIdRef.current !== block.id) return;
    const changed = (form.title !== block.title) || (form.short_description !== (block.short_description || ""))
      || (form.detailed_content !== (block.detailed_content || "")) || (form.level !== (block.level || ""))
      || (form.estimated_duration !== (block.estimated_duration || "")) || (form.node_style !== (block.node_style || "primary"));
    if (!changed) return;
    if (!form.title || !form.title.trim()) return;
    const t = setTimeout(() => onSave?.(form), 500);
    return () => clearTimeout(t);
  }, [form, canManage]);

  if (!block || !form) return null;
  const status = progress?.status || "not_started";

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] overflow-y-auto p-0 flex flex-col" data-testid="side-panel">
        <div className="p-6 border-b border-slate-200">
          <SheetHeader>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">
              <span className="px-2 py-0.5 rounded bg-slate-100">{block.level}</span>
              {block.estimated_duration && <span>~ {block.estimated_duration}</span>}
              <span className={
                status === "completed" ? "text-emerald-600"
                : status === "in_progress" ? "text-blue-600"
                : "text-slate-500"
              }>{STATUS_LABEL[status]}</span>
            </div>
            <SheetTitle className="font-display text-2xl text-left text-slate-900">{block.title}</SheetTitle>
            {block.short_description && (
              <SheetDescription className="text-left text-slate-600">{block.short_description}</SheetDescription>
            )}
          </SheetHeader>
        </div>

        <div className="flex-1 p-6 space-y-8">
          {canManage ? (
            <div className="space-y-4" data-testid="block-editor-form">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setField("title", e.target.value)} data-testid="edit-block-title" />
              </div>
              <div>
                <Label>Short description</Label>
                <Input value={form.short_description} onChange={(e) => setField("short_description", e.target.value)} data-testid="edit-block-short" />
              </div>
              <div>
                <Label>Detailed content</Label>
                <Textarea rows={5} value={form.detailed_content} onChange={(e) => setField("detailed_content", e.target.value)} data-testid="edit-block-detail" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Level</Label>
                  <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                    value={form.level} onChange={(e) => setField("level", e.target.value)} data-testid="edit-block-level">
                    {LEVEL_OPTIONS.map((l) => <option key={l || "none"} value={l}>{l || "— none —"}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Duration</Label>
                  <Input value={form.estimated_duration} onChange={(e) => setField("estimated_duration", e.target.value)} placeholder="e.g. 4h" data-testid="edit-block-duration" />
                </div>
              </div>
              <div>
                <Label>Block style</Label>
                <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                  value={form.node_style} onChange={(e) => setField("node_style", e.target.value)} data-testid="edit-block-style">
                  {STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2 items-center">
                <span className="text-xs text-slate-500 italic">{saving ? "Saving…" : "Auto-saves as you type"}</span>
                <Button variant="outline" onClick={onDelete} data-testid="edit-block-delete-btn" className="ml-auto">
                  <Trash2 size={14} className="mr-1 text-red-600" /> Delete block
                </Button>
              </div>
            </div>
          ) : (
            <>
              {block.detailed_content && (
                <div>
                  <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">Overview</h4>
                  <p className="text-slate-700 leading-relaxed text-[15px]">{block.detailed_content}</p>
                </div>
              )}
              {block.resources?.length > 0 && (
                <div>
                  <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">Resources</h4>
                  <ul className="space-y-2" data-testid="side-panel-resources">
                    {block.resources.map((r) => {
                      const Icon = RES_ICON[r.kind] || FileText;
                      return (
                        <li key={r.id}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="group flex items-center gap-3 border border-slate-200 rounded-md p-3 hover:border-slate-900 transition-colors">
                            <Icon size={16} className="text-slate-500 shrink-0" />
                            <span className="flex-1 text-sm text-slate-700 truncate">{r.label}</span>
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

        {!canManage && (canEdit ? (
          <div className="border-t border-slate-200 p-6 bg-slate-50 sticky bottom-0">
            <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">Update progress</h4>
            <div className="grid grid-cols-3 gap-2">
              <Button variant={status === "not_started" ? "default" : "outline"} size="sm" onClick={() => onStatusChange("not_started")} data-testid="status-btn-not-started" className="rounded-md">
                <Circle size={14} className="mr-1" /> Reset
              </Button>
              <Button variant={status === "in_progress" ? "default" : "outline"} size="sm" onClick={() => onStatusChange("in_progress")} data-testid="status-btn-in-progress" className={`rounded-md ${status === "in_progress" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}>
                <Loader2 size={14} className="mr-1" /> Doing
              </Button>
              <Button variant={status === "completed" ? "default" : "outline"} size="sm" onClick={() => onStatusChange("completed")} data-testid="status-btn-complete" className={`rounded-md ${status === "completed" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}>
                <Check size={14} className="mr-1" /> Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-200 p-6 bg-slate-50 text-sm text-slate-600">
            Log in to track your progress on this block.
          </div>
        ))}
      </SheetContent>
    </Sheet>
  );
}
