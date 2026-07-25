import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Valida um código de cupom sem expor a tabela `coupons` ao cliente.
 * Retorna somente { code, percent_off } quando ativo e dentro da janela de validade.
 */
export const validateCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ code: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.trim().toUpperCase();
    const { data: row } = await supabaseAdmin
      .from("coupons")
      .select("code, percent_off, active, valid_from, valid_until")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const now = Date.now();
    if (row.valid_from && new Date(row.valid_from).getTime() > now) return { ok: false as const };
    if (row.valid_until && new Date(row.valid_until).getTime() < now) return { ok: false as const };
    return { ok: true as const, code: row.code, percent_off: row.percent_off ?? 0 };
  });
