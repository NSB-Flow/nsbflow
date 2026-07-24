import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface CompanyFormValues {
  razao_social: string;
  cnpj: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  segment: string | null;
  company_size: string | null;
  assigned_to: string | null;
}

interface Props {
  initial?: Partial<CompanyFormValues>;
  submitting?: boolean;
  onSubmit: (v: CompanyFormValues) => void | Promise<void>;
  onCancel: () => void;
}

const EMPTY: CompanyFormValues = {
  razao_social: "",
  cnpj: null,
  address: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  segment: null,
  company_size: null,
  assigned_to: null,
};

export function CompanyForm({ initial, submitting, onSubmit, onCancel }: Props) {
  const { workspaceId } = useWorkspace();
  const [v, setV] = useState<CompanyFormValues>({ ...EMPTY, ...initial });

  useEffect(() => {
    setV({ ...EMPTY, ...initial });
  }, [initial]);

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members-for-assign", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: wm } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId!)
        .eq("active", true);
      const ids = (wm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (p ?? []).map((r) => ({ id: r.id, name: r.full_name ?? "Usuário" }));
    },
    staleTime: 60_000,
  });

  const set = <K extends keyof CompanyFormValues>(k: K, val: CompanyFormValues[K]) =>
    setV((cur) => ({ ...cur, [k]: val }));

  const submit = () => {
    if (v.razao_social.trim().length < 2) return toast.error("Informe a razão social");
    onSubmit({
      razao_social: v.razao_social.trim(),
      cnpj: v.cnpj?.trim() || null,
      address: v.address?.trim() || null,
      contact_name: v.contact_name?.trim() || null,
      contact_phone: v.contact_phone?.trim() || null,
      contact_email: v.contact_email?.trim() || null,
      segment: v.segment?.trim() || null,
      company_size: v.company_size || null,
      assigned_to: v.assigned_to || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Razão social *</Label>
          <Input value={v.razao_social} onChange={(e) => set("razao_social", e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input value={v.cnpj ?? ""} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
        </div>
        <div className="space-y-1.5">
          <Label>Segmento</Label>
          <Input value={v.segment ?? ""} onChange={(e) => set("segment", e.target.value)} placeholder="Ex.: Indústria, Varejo, SaaS" />
        </div>
        <div className="space-y-1.5">
          <Label>Porte</Label>
          <Select value={v.company_size ?? ""} onValueChange={(x) => set("company_size", x || null)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pequena">Pequena</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="grande">Grande</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Vendedor responsável</Label>
          <Select value={v.assigned_to ?? "__none__"} onValueChange={(x) => set("assigned_to", x === "__none__" ? null : x)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Ninguém —</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Endereço</Label>
          <Textarea rows={2} value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Contato — nome</Label>
          <Input value={v.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Contato — telefone</Label>
          <Input value={v.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Contato — e-mail</Label>
          <Input type="email" value={v.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} />
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
