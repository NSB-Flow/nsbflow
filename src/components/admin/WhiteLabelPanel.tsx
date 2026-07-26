/**
 * Painel administrativo do add-on "Relatórios White-Label".
 *
 * Permite ao super_admin (ou admin do workspace, quando o painel for
 * embutido em outra tela) configurar `branding_logo_url` e
 * `branding_company_name` para o workspace escolhido.
 *
 * Somente workspaces com o grant `report_white_label` ATIVO exibem o
 * branding customizado nos relatórios exportados; para os demais o
 * fallback é a marca NSB padrão.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Palette, Search, Upload, Trash2, ImageOff, History, Undo2 } from "lucide-react";

interface BrandingAuditRow {
  id: string;
  created_at: string;
  old_logo_url: string | null;
  new_logo_url: string | null;
  old_company_name: string | null;
  new_company_name: string | null;
  actor_user_id: string | null;
  ip: string | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  subscription_id: string | null;
  plan_tier: string | null;
  grant_enabled: boolean;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;

export function WhiteLabelPanel() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["wl-workspaces"],
    queryFn: async (): Promise<WorkspaceRow[]> => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, slug, is_personal, subscriptions(id, plans(tier), enterprise_module_grants(feature_key, enabled))")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((w: any) => {
        const sub = Array.isArray(w.subscriptions) ? w.subscriptions[0] : w.subscriptions;
        const plan = sub ? (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) : null;
        const grants = (sub?.enterprise_module_grants ?? []) as { feature_key: string; enabled: boolean }[];
        const wl = grants.find((g) => g.feature_key === "report_white_label");
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          is_personal: w.is_personal,
          subscription_id: sub?.id ?? null,
          plan_tier: plan?.tier ?? null,
          grant_enabled: !!wl?.enabled,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q));
  }, [workspaces, search]);

  const selected = workspaces.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" /> Workspaces
          </CardTitle>
          <div className="relative mt-2">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto divide-y">
              {filtered.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${
                    selectedId === w.id ? "bg-muted/70" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{w.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.slug}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {w.grant_enabled ? (
                        <Badge className="text-[9px] uppercase h-4 px-1 bg-emerald-600/15 text-emerald-700 border-emerald-600/30">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] uppercase h-4 px-1">
                          Sem add-on
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        {selected ? (
          <WhiteLabelEditor ws={selected} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Selecione um workspace para configurar o branding.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function WhiteLabelEditor({ ws }: { ws: WorkspaceRow }) {
  const [companyName, setCompanyName] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["wl-workspace", ws.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("branding_logo_url, branding_company_name")
        .eq("id", ws.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setCompanyName(data?.branding_company_name ?? "");
    setLogoPath(data?.branding_logo_url ?? null);
    setLogoPreview(null);
    if (data?.branding_logo_url) {
      void supabase.storage.from("workspace-logos").createSignedUrl(data.branding_logo_url, 3600)
        .then(({ data: sig }) => setLogoPreview(sig?.signedUrl ?? null));
    }
  }, [data]);

  const onSelectFile = () => fileRef.current?.click();

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG ou SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo grande demais. Limite de 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${ws.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("workspace-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Remove old file (best effort)
      if (logoPath && logoPath !== path) {
        await supabase.storage.from("workspace-logos").remove([logoPath]).catch(() => {});
      }
      setLogoPath(path);
      const { data: sig } = await supabase.storage.from("workspace-logos").createSignedUrl(path, 3600);
      setLogoPreview(sig?.signedUrl ?? null);
      toast.success("Logo enviado. Clique em Salvar para aplicar.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar logo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    if (!logoPath) return;
    if (!confirm("Remover o logo customizado?")) return;
    await supabase.storage.from("workspace-logos").remove([logoPath]).catch(() => {});
    setLogoPath(null);
    setLogoPreview(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          branding_company_name: companyName.trim() || null,
          branding_logo_url: logoPath,
        })
        .eq("id", ws.id);
      if (error) throw error;
      toast.success("Branding salvo.");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const previewName = companyName.trim() || "NSB · GROWTH BY METHOD";
  const willApply = ws.grant_enabled && (logoPreview || companyName.trim());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{ws.name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">{ws.slug}</div>
          </div>
          {ws.grant_enabled ? (
            <Badge className="bg-emerald-600/15 text-emerald-700 border-emerald-600/30">
              Add-on ativo
            </Badge>
          ) : (
            <Badge variant="outline">Add-on inativo — usará marca NSB</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!ws.grant_enabled && (
          <div className="text-xs rounded-md border bg-muted/40 p-2.5 leading-snug">
            Este workspace ainda não tem o grant <code>report_white_label</code> habilitado.
            Você pode configurar o branding aqui, mas as exportações continuarão com a marca NSB
            até que o add-on seja habilitado na aba <strong>Individual</strong> ou <strong>Em Lote</strong>.
          </div>
        )}

        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Nome da empresa (para relatórios)
          </Label>
          <Input
            value={companyName}
            maxLength={80}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ex.: Acme Corp · Growth Ops"
            className="mt-1"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Exibido no lugar de “NSB · Growth by Method” no cabeçalho dos relatórios exportados.
          </p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Logo</Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImageOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={onSelectFile} disabled={uploading}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Enviando…" : "Enviar logo"}
            </Button>
            {logoPath && (
              <Button variant="ghost" size="sm" onClick={removeLogo}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            PNG, JPG ou SVG — até 2 MB. Ideal: fundo transparente e proporção horizontal.
          </p>
        </div>

        {/* Preview */}
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Prévia do cabeçalho</Label>
          <div className="mt-2 rounded-lg overflow-hidden border">
            <div
              className="p-6 text-white"
              style={{ backgroundColor: "#0A2540" }}
            >
              <div className="flex items-center gap-4">
                {willApply && logoPreview ? (
                  <img src={logoPreview} alt="" className="h-10 w-auto object-contain" />
                ) : null}
                <div>
                  <div
                    className="text-[10px] tracking-[0.3em] font-bold"
                    style={{ color: "#C9A24B" }}
                  >
                    {(willApply ? previewName : "NSB · GROWTH BY METHOD").toUpperCase()}
                  </div>
                  <div className="text-xl font-semibold mt-1">Relatório — Visão Geral</div>
                  <div
                    className="mt-3 h-[3px] w-14"
                    style={{ backgroundColor: "#C9A24B" }}
                  />
                </div>
              </div>
            </div>
          </div>
          {!willApply && ws.grant_enabled && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Configure o nome ou envie um logo para aplicar o branding.
            </p>
          )}
        </div>

        <BrandingHistory workspaceId={ws.id} onRevert={async () => { await refetch(); }} />

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button onClick={save} disabled={saving || isLoading}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BrandingHistory({ workspaceId, onRevert }: { workspaceId: string; onRevert: () => Promise<void> }) {
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["wl-audit", workspaceId],
    queryFn: async (): Promise<BrandingAuditRow[]> => {
      const { data, error } = await supabase
        .from("workspace_branding_audit")
        .select("id, created_at, old_logo_url, new_logo_url, old_company_name, new_company_name, actor_user_id, ip")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BrandingAuditRow[];
    },
  });

  const [reverting, setReverting] = useState<string | null>(null);

  const revertTo = async (row: BrandingAuditRow) => {
    if (!confirm("Reverter o branding para os valores anteriores a esta alteração?")) return;
    setReverting(row.id);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          branding_logo_url: row.old_logo_url,
          branding_company_name: row.old_company_name,
        })
        .eq("id", workspaceId);
      if (error) throw error;
      toast.success("Branding revertido.");
      await Promise.all([refetch(), onRevert()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reverter.");
    } finally {
      setReverting(null);
    }
  };

  const fmt = (v: string | null) => (v && v.trim() ? v : "—");
  const shortPath = (p: string | null) => {
    if (!p) return "—";
    const parts = p.split("/");
    return parts[parts.length - 1] || p;
  };

  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> Histórico de alterações
      </Label>
      <div className="mt-2 rounded-md border divide-y max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Nenhuma alteração registrada.</div>
        ) : (
          rows.map((r) => {
            const nameChanged = r.old_company_name !== r.new_company_name;
            const logoChanged = r.old_logo_url !== r.new_logo_url;
            return (
              <div key={r.id} className="p-2.5 text-xs flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                    {r.ip ? ` · ${r.ip}` : ""}
                  </div>
                  {nameChanged && (
                    <div className="mt-1">
                      <span className="text-muted-foreground">Nome:</span>{" "}
                      <span className="line-through text-muted-foreground">{fmt(r.old_company_name)}</span>{" "}
                      → <span className="font-medium">{fmt(r.new_company_name)}</span>
                    </div>
                  )}
                  {logoChanged && (
                    <div className="mt-0.5">
                      <span className="text-muted-foreground">Logo:</span>{" "}
                      <span className="line-through text-muted-foreground">{shortPath(r.old_logo_url)}</span>{" "}
                      → <span className="font-medium">{shortPath(r.new_logo_url)}</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revertTo(r)}
                  disabled={reverting === r.id}
                  className="shrink-0"
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  {reverting === r.id ? "Revertendo…" : "Reverter"}
                </Button>
              </div>
            );
          })
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Últimas 50 alterações. Reverter aplica o estado anterior a esse registro (nome + logo).
      </p>
    </div>
  );
}
