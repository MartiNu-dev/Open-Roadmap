import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPositionLabel } from "@/i18n/formatters";
import { Trash2 } from "lucide-react";

const STYLES = ["solid", "dashed", "dotted"];
const THICKNESSES = ["small", "medium", "large"];
const SIDES = ["top", "right", "bottom", "left"];
const COLORS = ["#475569", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function LinkSidePanel({ open, onOpenChange, link, onSave, onDelete }) {
  const [form, setForm] = useState(null);
  const { t } = useTranslation("roadmaps");

  useEffect(() => {
    if (link) setForm({
      label: link.label || "", style: link.style || "solid",
      thickness: link.thickness || "medium", color: link.color || "#475569",
      from_side: link.from_side || "bottom", to_side: link.to_side || "top",
    });
  }, [link?.id]);

  useEffect(() => {
    if (!form || !link) return;
    const timeoutId = setTimeout(() => {
      const changed = Object.keys(form).some((key) => (link[key] || "") !== (form[key] || ""));
      if (changed) onSave?.(form);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [form, link, onSave]);

  if (!link || !form) return null;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] sm:max-w-[420px] overflow-y-auto" data-testid="link-side-panel">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{t("linkPanel.title")}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <Label>{t("linkPanel.labelOptional")}</Label>
            <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder={t("linkPanel.labelPlaceholder")} data-testid="link-label-input" />
          </div>
          <div>
            <Label>{t("linkPanel.style")}</Label>
            <div className="flex gap-2 mt-1">
              {STYLES.map((style) => (
                <button key={style} onClick={() => set("style", style)} data-testid={`link-style-${style}`}
                  className={`px-3 py-1 text-xs rounded-md border ${form.style === style ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}>
                  {t(`linkPanel.styles.${style}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("linkPanel.thickness")}</Label>
            <div className="flex gap-2 mt-1">
              {THICKNESSES.map((thickness) => (
                <button key={thickness} onClick={() => set("thickness", thickness)} data-testid={`link-thickness-${thickness}`}
                  className={`px-3 py-1 text-xs rounded-md border ${form.thickness === thickness ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}>
                  {t(`linkPanel.thicknesses.${thickness}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("linkPanel.color")}</Label>
            <div className="flex gap-2 mt-1 items-center">
              {COLORS.map((color) => (
                <button key={color} onClick={() => set("color", color)} data-testid={`link-color-${color}`}
                  aria-label={`${t("linkPanel.color")} ${color}`}
                  className={`w-7 h-7 rounded-full border-2 ${form.color === color ? "border-slate-900 scale-110" : "border-white"} transition`}
                  style={{ backgroundColor: color }} />
              ))}
              <Input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="w-12 h-8 p-1" data-testid="link-color-picker" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("linkPanel.fromSide")}</Label>
              <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                value={form.from_side} onChange={(e) => set("from_side", e.target.value)} data-testid="link-from-side">
                {SIDES.map((side) => <option key={side} value={side}>{getPositionLabel(t, side)}</option>)}
              </select>
            </div>
            <div>
              <Label>{t("linkPanel.toSide")}</Label>
              <select className="w-full h-10 border border-slate-200 rounded-md px-2 text-sm bg-white"
                value={form.to_side} onChange={(e) => set("to_side", e.target.value)} data-testid="link-to-side">
                {SIDES.map((side) => <option key={side} value={side}>{getPositionLabel(t, side)}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("linkPanel.changesSaveAutomatically")}</p>
          <Button variant="outline" onClick={onDelete} className="w-full" data-testid="link-delete-btn">
            <Trash2 size={14} className="mr-2 text-red-600" /> {t("common:actions.delete")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
