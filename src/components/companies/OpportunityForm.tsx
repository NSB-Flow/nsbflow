import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const OPPORTUNITY_STATUSES = [
  { value: "aberta", label: "Aberta" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "proposta_enviada", label: "Proposta enviada" },
  { value: "ganha", label: "Ganha" },
  { value: "perdida", label: "Perdida" },
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]["value"];

export interface OpportunityFormValues {
  title: string;
  status: OpportunityStatus;
  monthly_value: number | null;
  contract_months: number | null;
  total_contract_value: number | null;
  quantity: number | null;
}

interface Props {
  initial?: Partial<OpportunityFormValues>;
  submitting?: boolean;
  onSubmit: (v: OpportunityFormValues) => void | Promise<unknown>;
  onCancel: () => void;
}

const EMPTY: OpportunityFormValues = {
  title: "",
  status: "aberta",
  monthly_value: null,
  contract_months: null,
  total_contract_value: null,
  quantity: null,
};

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function OpportunityForm({ initial, submitting, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<OpportunityFormValues>({ ...EMPTY, ...initial });

  useEffect(() => {
    setV({ ...EMPTY, ...initial });
  }, [initial]);

  const set = <K extends keyof OpportunityFormValues>(k: K, val: OpportunityFormValues[K]) =>
    setV((cur) => {
      const next = { ...cur, [k]: val };
      // Auto-calculate total when monthly * months are set and user hasn't overridden total in this change
      if ((k === "monthly_value" || k === "contract_months") && next.monthly_value != null && next.contract_months != null) {
        next.total_contract_value = Number((next.monthly_value * next.contract_months).toFixed(2));
      }
      return next;
    });

  const submit = () => {
    if (v.title.trim().length < 2) return toast.error("Informe o título da oportunidade");
    onSubmit({ ...v, title: v.title.trim() });
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Título *</Label>
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Contrato anual de consultoria" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={v.status} onValueChange={(x) => set("status", x as OpportunityStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPPORTUNITY_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quantidade</Label>
          <Input
            inputMode="numeric"
            value={v.quantity ?? ""}
            onChange={(e) => set("quantity", e.target.value ? Math.max(0, parseInt(e.target.value, 10) || 0) : null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Valor mensal (R$)</Label>
          <Input inputMode="decimal" value={v.monthly_value ?? ""} onChange={(e) => set("monthly_value", num(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Meses previstos</Label>
          <Input
            inputMode="numeric"
            value={v.contract_months ?? ""}
            onChange={(e) => set("contract_months", e.target.value ? Math.max(0, parseInt(e.target.value, 10) || 0) : null)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Valor total do contrato (R$)</Label>
          <Input
            inputMode="decimal"
            value={v.total_contract_value ?? ""}
            onChange={(e) => set("total_contract_value", num(e.target.value))}
            placeholder="Preenchido automaticamente por mensal × meses"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
