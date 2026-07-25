/**
 * Single source of truth for agent display names shown in the UI.
 * Mirrors `agents.display_name` in the database (the `agents` table is
 * restricted to super admins, so we can't read it from the browser client).
 * Keep this map in sync with the `agents` table.
 */
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  deap_briefing: "Deap Briefing AI",
  deap_intelligence: "Deap Intelligence AI",
};

export function agentDisplayName(slug: string | null | undefined): string {
  if (!slug) return "";
  return AGENT_DISPLAY_NAMES[slug] ?? slug;
}
