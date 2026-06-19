import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

const STYLES = ["solid", "dashed", "dotted"];
const THICKNESSES = ["small", "medium", "large"];
const SIDES = ["top", "right", "bottom", "left"];
const COLORS = ["#475569", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function LinkSidePanel({ open, onOpenChange, link, onSave, onDelete }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (link) setForm({
      label: link.label || "", style: link.style || "solid",
      thickness: link.thickness || "medium", color: link.color || "#475569",
      from_side: link.from_side || "bottom", to_side: link.to_side || "top",
    });
  }, [link?.id]);

  // Auto-save on form change
  useEffect(() => {
    if (!form || !link) return;
    const t = setTimeout(() => {
      const changed = Object.keys(form).some((k) => (link[k] || "") !== (form[k] || ""));
      if (changed) onSave?.(form);
    }, 400);
    return () => clearTimeout(t);
  }, [form]);

  if (!link || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] sm:max-w-[420px] overflow-y-auto" data-testid="link-side-panel">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">Link properties</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <Label>Label (optional)</Label>
            <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. recommended" data-testid="link-label-input" />
          </div>
          <div>
            <Label>Style</Label>
            <div className="flex gap-2 mt-1">
              {STYLES.map((s) => (
                <button key={s} onClick={() => set("style", s)} data-testid={`link-style-${s}`}
                  className={`px-3 py-1 text-xs rounded-md border ${form.style === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Thickness</Label>
            <div className="flex gap-2 mt-1">
              {THICKNESSES.map((t) => (
                <button key={t} onClick={() => set("thickness", t)} data-testid={`link-thickness-${t}`}
                  className={`px-3 py-1 text-xs rounded-md border ${form.thickness === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1 items-center">
              {COLORS.map((c) => (
                <button key={c} onClick={() => set("color", c)} data-testid={`link-color-${c}`}
                  className={`w-7 h-7 rounded-full border-2 ${form.color === c ? "border-slate-900 scale-110" : "border-white"} transition`}
                  style={{ backgroundColor: c }} />
              ))}
              <Input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="w-12 h-8 p-1" data-testid="link-color-picker" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From side</Label>
              <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                value={form.from_side} onChange={(e) => set("from_side", e.target.value)} data-testid="link-from-side">
                {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label>To side</Label>
              <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                value={form.to_side} onChange={(e) => set("to_side", e.target.value)} data-testid="link-to-side">
                {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">Changes save automatically.</p>
          <Button variant="outline" onClick={onDelete} className="w-full" data-testid="link-delete-btn">
            <Trash2 size={14} className="mr-2 text-red-600" /> Delete link
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
