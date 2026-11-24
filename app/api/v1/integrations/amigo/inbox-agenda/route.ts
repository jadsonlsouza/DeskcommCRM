import { randomUUID } from "node:crypto";
import { z } from "zod";
import { amigoResponseSchemas } from "@/lib/amigo/contracts";
import { checkConnection } from "@/lib/amigo/connection";
import { ocupacaoSemDadosDoPaciente, somarDiasDaSemana } from "@/lib/amigo/inbox-week";
import { getAmigoConfig, loadAmigoConnection } from "@/lib/amigo/store";
import { requestAmigo } from "@/lib/amigo/transport";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { amigoFailure } from "../_shared";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

const querySchema = z.union([
  z.strictObject({ conversa: z.uuid() }),
  z.strictObject({
    conversa: z.uuid(),
    inicio: z.iso.date(),
    medico: z.coerce.number().int().positive(),
    unidade: z.coerce.number().int().positive().optional(),
  }),
]);

export async function GET(req: Request) {
  const requestId = randomUUID();
  const auth = await requireRole("agent", { requestId, resource: "amigo_inbox_agenda" });
  if (!auth.ok) return auth.response;
  try {
    const input = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const db = await createClient();
    const { data: conversation, error } = await db
      .from("conversations")
      .select("contact_id")
      .eq("organization_id", auth.org.orgId)
      .eq("id", input.conversa)
      .maybeSingle();
    if (error) throw error;
    if (!conversation?.contact_id)
      return fail("not_found", "Conversa com contato não encontrada.", 404, { requestId });

    if ("inicio" in input) {
      const connection = await loadAmigoConnection(auth.org.orgId);
      if (!connection?.active)
        return fail("amigo_inactive", "O modo Amigo precisa estar ativo.", 422, { requestId });
      checkConnection(connection.id, req.headers.get("X-Amigo-Connection") ?? undefined, true);
      const end = somarDiasDaSemana(input.inicio, 6);
      const response = await requestAmigo(connection.token, "attendances", {
        start_date: input.inicio,
        end_date: end,
        status: "ALL",
        ...(input.unidade ? { place_id: input.unidade } : {}),
      });
      const rows = amigoResponseSchemas.attendances.parse(response.data);
      const occupancy = ocupacaoSemDadosDoPaciente(rows, {
        start: input.inicio, end, doctor: input.medico,
      }, connection.timezone);
      return ok({ occupancy }, { requestId, headers: noStore });
    }

    const config = await getAmigoConfig(auth.org.orgId);
    if (!config.active || !config.connection_id)
      return ok({ config, next: null }, { requestId, headers: noStore });
    const admin = createAdminClient();
    const links = await admin.from("amigo_patient_links")
      .select("patient_id")
      .eq("organization_id", auth.org.orgId)
      .eq("contact_id", conversation.contact_id)
      .eq("connection_id", config.connection_id);
    if (links.error) throw links.error;
    const { data: next, error: nextError } = await admin
      .from("calendar_appointments")
      .select("title,starts_at,external_status")
      .eq("organization_id", auth.org.orgId)
      .eq("contact_id", conversation.contact_id)
      .eq("authority", "amigo")
      .eq("external_connection_id", config.connection_id)
      .eq("status", "confirmed")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .maybeSingle();
    if (nextError) throw nextError;
    return ok({ config, next, patientIds: links.data.map((row) => row.patient_id) }, { requestId, headers: noStore });
  } catch (error) {
    return amigoFailure(error, requestId);
  }
}
