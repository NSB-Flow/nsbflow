/**
 * Scheduled transcript polling. Runs with the service role (no user session):
 * for each meeting whose scheduled time has passed, tries the platform API
 * using the token of the user who created the meeting.
 */
import {
  PLATFORM_PROVIDER,
  fetchTranscript,
  validAccessToken,
  type ConnectionRow,
  type MeetingPlatform,
} from "./providers.server";

const GRACE_MS = 60 * 60 * 1000; // wait 1h after the scheduled start
const GIVE_UP_MS = 48 * 60 * 60 * 1000; // 48h without a transcript -> failed

export interface PollSummary {
  checked: number;
  ready: number;
  pending: number;
  failed: number;
}

export async function pollTranscripts(meetingId?: string): Promise<PollSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();

  let query = supabaseAdmin
    .from("meetings")
    .select(
      "id, workspace_id, created_by, platform, meeting_link, external_meeting_id, scheduled_at, status, created_at",
    )
    .in("status", ["scheduled", "transcript_pending"])
    .limit(50);

  if (meetingId) query = query.eq("id", meetingId);
  else query = query.or(`scheduled_at.lte.${cutoff},scheduled_at.is.null`);

  const { data: meetings, error } = await query;
  if (error) throw new Error(error.message);

  const summary: PollSummary = { checked: 0, ready: 0, pending: 0, failed: 0 };

  for (const m of meetings ?? []) {
    summary.checked++;
    const platform = m.platform as MeetingPlatform;
    const provider = PLATFORM_PROVIDER[platform];
    const startedAt = new Date(m.scheduled_at ?? m.created_at).getTime();
    const expired = Date.now() - startedAt > GIVE_UP_MS;

    const fail = async (msg: string) => {
      summary.failed++;
      await supabaseAdmin
        .from("meetings")
        .update({ status: "failed", last_error: msg.slice(0, 300) })
        .eq("id", m.id);
    };
    const pending = async (msg: string | null) => {
      if (expired) return fail(msg ?? "Transcrição não disponível após 48h");
      summary.pending++;
      await supabaseAdmin
        .from("meetings")
        .update({ status: "transcript_pending", last_error: msg?.slice(0, 300) ?? null })
        .eq("id", m.id);
    };

    try {
      const { data: conn } = await supabaseAdmin
        .from("meeting_platform_connections")
        .select("id, user_id, workspace_id, provider, access_token, refresh_token, token_expires_at, status")
        .eq("user_id", m.created_by)
        .eq("provider", provider)
        .maybeSingle();

      if (!conn || conn.status !== "active") {
        await pending("Conta da plataforma não conectada");
        continue;
      }

      const token = await validAccessToken(conn as ConnectionRow);
      const result = await fetchTranscript(platform, token, m.meeting_link, m.external_meeting_id);

      if (result.text) {
        summary.ready++;
        await supabaseAdmin
          .from("meetings")
          .update({
            transcript_text: result.text,
            transcript_fetched_at: new Date().toISOString(),
            status: "transcript_ready",
            last_error: null,
            ...(result.externalId ? { external_meeting_id: result.externalId } : {}),
          })
          .eq("id", m.id);
      } else {
        if (result.externalId && !m.external_meeting_id) {
          await supabaseAdmin
            .from("meetings")
            .update({ external_meeting_id: result.externalId })
            .eq("id", m.id);
        }
        await pending(null);
      }
    } catch (e) {
      await pending(e instanceof Error ? e.message : String(e));
    }
  }

  return summary;
}
