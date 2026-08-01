import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Loader2, Network, X } from "lucide-react";
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
  parent_company_id: string | null;
}

interface Props {
  /** Company being edited — excluded (with its descendants) from the group picker. */
  companyId?: string;
  initial?: Partial<CompanyFormValues>;
  submitting?: boolean;
  onSubmit: (v: CompanyFormValues) => void | Promise<unknown>;
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
  parent_company_id: null,
};

export function CompanyForm({ companyId, initial, submitting, onSubmit, onCancel }: Props) {
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

  const { data: groupOptions = [] } = useQuery({
    queryKey: ["companies-for-group", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, razao_social, cnpj, parent_company_id")
        .eq("workspace_id", workspaceId!)
        .order("razao_social", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        razao_social: string;
        cnpj: string | null;
        parent_company_id: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  // Exclude the company itself and every descendant, so no cycle can be created.
  const eligibleParents = useMemo(() => {
    if (!companyId) return groupOptions;
    const blocked = new Set<string>([companyId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of groupOptions) {
        if (c.parent_company_id && blocked.has(c.parent_company_id) && !blocked.has(c.id)) {
          blocked.add(c.id);
          grew = true;
        }
      }
    }
    return groupOptions.filter((c) => !blocked.has(c.id));
  }, [groupOptions, companyId]);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const filteredParents = useMemo(() => {
    const s = groupQuery.trim().toLowerCase();
    if (!s) return eligibleParents;
    return eligibleParents.filter(
      (c) => c.razao_social.toLowerCase().includes(s) || (c.cnpj ?? "").toLowerCase().includes(s),
    );
  }, [eligibleParents, groupQuery]);
  const selectedParent = eligibleParents.find((c) => c.id === v.parent_company_id) ?? null;

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
      parent_company_id: v.parent_company_id || null,
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
          <Label>Faz parte do grupo econômico de:</Label>
          <div className="flex items-center gap-2">
            <Popover open={groupOpen} onOpenChange={setGroupOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={groupOpen}
                  className={cn("flex-1 justify-between font-normal", !selectedParent && "text-muted-foreground")}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Network className="h-4 w-4 shrink-0 opacity-60" />
                    {selectedParent ? selectedParent.razao_social : "Nenhum grupo (empresa independente)"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar empresa-mãe por razão social ou CNPJ..."
                    value={groupQuery}
                    onValueChange={setGroupQuery}
                  />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                      Nenhuma empresa disponível.
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredParents.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            set("parent_company_id", c.id === v.parent_company_id ? null : c.id);
                            setGroupOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", v.parent_company_id === c.id ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span className="text-sm">{c.razao_social}</span>
                            {c.cnpj && <span className="text-xs text-muted-foreground">{c.cnpj}</span>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedParent && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover vínculo de grupo"
                onClick={() => set("parent_company_id", null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Opcional. A empresa-mãe precisa ser do mesmo workspace; vínculos circulares são bloqueados.
          </p>
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
