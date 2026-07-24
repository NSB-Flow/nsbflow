import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

export type AuditField = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  full?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  badge?: { label: string; variant?: "default" | "destructive" | "secondary" };
  fields: AuditField[];
  raw: unknown;
};

export function AuditDetailSheet({ open, onOpenChange, title, subtitle, badge, fields, raw }: Props) {
  const rawJson = JSON.stringify(raw, null, 2);
  const copyJson = () => {
    void navigator.clipboard?.writeText(rawJson);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="font-display">{title}</SheetTitle>
            {badge && (
              <Badge variant={badge.variant ?? "default"} className="uppercase text-[10px]">
                {badge.label}
              </Badge>
            )}
          </div>
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
        </SheetHeader>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map((f, i) => (
            <div key={i} className={f.full ? "col-span-2" : "col-span-2 sm:col-span-1"}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                {f.label}
              </div>
              <div className={`text-xs ${f.mono ? "font-mono break-all" : ""}`}>
                {f.value ?? <span className="text-muted-foreground">—</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Payload bruto
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyJson}>
              <Copy className="h-3 w-3 mr-1" /> Copiar
            </Button>
          </div>
          <pre className="text-[11px] leading-relaxed bg-muted/40 border rounded-md p-3 overflow-x-auto max-h-80">
            {rawJson}
          </pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}
