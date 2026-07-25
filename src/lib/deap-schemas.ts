import { z } from "zod";

// Kept for compatibility; agents no longer read a fixed catalog.
export const SOLUTIONS: readonly string[] = [];

export const briefingSchema = z.object({
  company_id: z.string().uuid("Selecione uma conta"),
  objective: z.string().trim().max(2000).optional().or(z.literal("")),
  solutions: z.array(z.string().trim().min(1).max(80)).min(1, "Adicione ao menos uma solução"),
});
export type BriefingForm = z.infer<typeof briefingSchema>;

export const meetingSchema = z.object({
  company_id: z.string().uuid("Selecione uma conta"),
  attachment_url: z.string().url().optional().or(z.literal("")),
  attachment_name: z.string().optional(),
});
export type MeetingForm = z.infer<typeof meetingSchema>;
