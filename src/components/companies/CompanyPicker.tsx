import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface Company {
  id: string;
  razao_social: string;
  cnpj: string | null;
}

interface Props {
  value: string | null;
  onChange: (company: Company | null) => void;
  disabled?: boolean;
}

export function CompanyPicker({ value, onChange, disabled }: Props) {
  const { workspaceId } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, razao_social, cnpj")
        .eq("workspace_id", workspaceId!)
        .order("razao_social", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    staleTime: 30_000,
  });

  const selected = useMemo(() => companies.find((c) => c.id === value) ?? null, [companies, value]);

  // If we have a value but the row hasn't loaded yet (e.g. from URL), fetch it directly.
  useEffect(() => {
    if (!value || selected || !workspaceId) return;
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, razao_social, cnpj")
        .eq("id", value)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data) onChange(data as Company);
    })();
  }, [value, selected, workspaceId, onChange]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) =>
        c.razao_social.toLowerCase().includes(s) ||
        (c.cnpj ?? "").toLowerCase().includes(s),
    );
  }, [companies, q]);

  const [newName, setNewName] = useState("");
  const [newCnpj, setNewCnpj] = useState("");
  const [creating, setCreating] = useState(false);

  const createCompany = async () => {
    if (!workspaceId || !user) return;
    const name = newName.trim();
    if (name.length < 2) return toast.error("Informe a razão social");
    setCreating(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({
        workspace_id: workspaceId,
        created_by: user.id,
        razao_social: name,
        cnpj: newCnpj.trim() || null,
      })
      .select("id, razao_social, cnpj")
      .single();
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada");
    setNewName("");
    setNewCnpj("");
    setCreateOpen(false);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["companies", workspaceId] });
    onChange(data as Company);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || !workspaceId}
            className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0 opacity-60" />
              {selected ? selected.razao_social : "Selecione uma conta"}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar por razão social ou CNPJ..." value={q} onValueChange={setQ} />
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : (
                <>
                  <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                    Nenhuma conta encontrada.
                  </CommandEmpty>
                  <CommandGroup>
                    {filtered.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => {
                          onChange(c);
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col">
                          <span className="text-sm">{c.razao_social}</span>
                          {c.cnpj && <span className="text-xs text-muted-foreground">{c.cnpj}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setNewName(q);
                    setCreateOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" /> Criar nova conta{q ? `: "${q}"` : ""}
                </Button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Nova conta</DialogTitle>
            <DialogDescription>Cadastre a empresa para vincular às execuções dos agentes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Razão social *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={createCompany} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
