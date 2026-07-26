/**
 * White-Label branding helper for report exports.
 *
 * Rules (per add-on `report_white_label`):
 *  - Workspace precisa ter o grant `report_white_label` ATIVO.
 *  - E precisa ter `branding_logo_url` e/ou `branding_company_name` preenchidos.
 *  - Caso contrário, mantém o branding NSB padrão.
 *
 * `branding_logo_url` armazena o *object path* dentro do bucket
 * privado `workspace-logos` (ex.: `<workspace_id>/logo.png`).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ReportBranding {
  companyName?: string | null;
  logoDataUrl?: string | null;
}

async function pathToDataUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("workspace-logos")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Resolve o branding aplicável ao workspace. Retorna `null` se o padrão NSB
 * deve prevalecer (grant inativo, sem plano, ou sem campos preenchidos).
 */
export async function resolveReportBranding(
  workspaceId: string | null,
): Promise<ReportBranding | null> {
  if (!workspaceId) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!sub?.id) return null;

  const { data: grant } = await supabase
    .from("enterprise_module_grants")
    .select("enabled")
    .eq("subscription_id", sub.id)
    .eq("feature_key", "report_white_label")
    .maybeSingle();
  if (!grant?.enabled) return null;

  const { data: ws } = await supabase
    .from("workspaces")
    .select("branding_logo_url, branding_company_name")
    .eq("id", workspaceId)
    .maybeSingle();

  const name = ws?.branding_company_name?.trim() || null;
  const logoPath = ws?.branding_logo_url?.trim() || null;
  if (!name && !logoPath) return null;

  const logoDataUrl = logoPath ? await pathToDataUrl(logoPath) : null;
  if (!name && !logoDataUrl) return null;
  return { companyName: name, logoDataUrl };
}
