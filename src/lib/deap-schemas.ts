import { z } from "zod";

export const SOLUTIONS = [
  "Link Dedicado",
  "Telefonia Móvel",
  "Cloud",
  "IA",
  "Segurança",
  "Microsoft",
  "Google Workspace",
  "Data Center",
  "Backup",
  "Contact Center",
  "SD-WAN",
  "5G Corporativo",
] as const;

export const briefingSchema = z.object({
  company: z.string().trim().min(2, "Informe a razão social").max(200),
  cnpj: z.string().trim().min(14, "CNPJ inválido").max(20),
  objective: z.string().trim().max(2000).optional().or(z.literal("")),
  solutions: z.array(z.string()).min(1, "Selecione ao menos uma solução"),
  seller_sector: z.string().trim().max(120).optional().or(z.literal("")),
});
export type BriefingForm = z.infer<typeof briefingSchema>;

export const meetingSchema = briefingSchema.extend({
  attachment_url: z.string().url().optional().or(z.literal("")),
  attachment_name: z.string().optional(),
});
export type MeetingForm = z.infer<typeof meetingSchema>;
