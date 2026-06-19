import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Circle, Loader2, Check, ExternalLink, BookOpen, Video, FileText } from "lucide-react";

const STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const RES_ICON = {
  article: FileText,
  video: Video,
  docs: BookOpen,
  course: BookOpen,
};

export default function BlockSidePanel({ open, onOpenChange, block, progress, onStatusChange, canEdit }) {
  if (!block) return null;
  const status = progress?.status || "not_started";

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
        </div>

        {canEdit ? (
          <div className="border-t border-slate-200 p-6 bg-slate-50 sticky bottom-0">
            <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 mb-3">Update progress</h4>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={status === "not_started" ? "default" : "outline"}
                size="sm" onClick={() => onStatusChange("not_started")}
                data-testid="status-btn-not-started" className="rounded-md">
                <Circle size={14} className="mr-1" /> Reset
              </Button>
              <Button
                variant={status === "in_progress" ? "default" : "outline"}
                size="sm" onClick={() => onStatusChange("in_progress")}
                data-testid="status-btn-in-progress"
                className={`rounded-md ${status === "in_progress" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}>
                <Loader2 size={14} className="mr-1" /> Doing
              </Button>
              <Button
                variant={status === "completed" ? "default" : "outline"}
                size="sm" onClick={() => onStatusChange("completed")}
                data-testid="status-btn-complete"
                className={`rounded-md ${status === "completed" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}>
                <Check size={14} className="mr-1" /> Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-200 p-6 bg-slate-50 text-sm text-slate-600">
            Log in to track your progress on this block.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
