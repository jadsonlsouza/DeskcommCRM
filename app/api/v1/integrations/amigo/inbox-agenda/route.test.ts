import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  conversation: vi.fn(),
  connection: vi.fn(),
  requestAmigo: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, org: { orgId: "clinica" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.conversation,
    };
    return query;
  },
}));
vi.mock("@/lib/amigo/store", () => ({
  loadAmigoConnection: mocks.connection,
  getAmigoConfig: vi.fn(),
}));
vi.mock("@/lib/amigo/transport", () => ({
  requestAmigo: mocks.requestAmigo,
  AmigoError: class extends Error {},
}));

const conversation = "00000000-0000-4000-8000-000000000001";
const path = `http://localhost/api/v1/integrations/amigo/inbox-agenda?conversa=${conversation}&inicio=2026-11-22&medico=5&unidade=3`;
const request = (connection = "agora") => new Request(path, {
  headers: { "X-Amigo-Connection": connection },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversation.mockResolvedValue({ data: { contact_id: "contato" }, error: null });
  mocks.connection.mockResolvedValue({ active: true, id: "agora", token: "ficticio", timezone: "America/Fortaleza" });
});

describe("ocupação Amigo no Inbox", () => {
  it("consulta sete dias e devolve somente a ocupação do médico", async () => {
    mocks.requestAmigo.mockResolvedValue({ data: [
      { id: 1, user_id: 5, start_date: "2026-11-23 10:00", patient: { id: 10, name: "Paciente fictício" } },
      { id: 2, user_id: 7, start_date: "2026-11-23 11:00" },
    ] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.requestAmigo).toHaveBeenCalledWith("ficticio", "attendances", {
      start_date: "2026-11-22", end_date: "2026-11-28", status: "ALL", place_id: 3,
    });
    expect((await response.json()).data).toEqual({
      occupancy: [{ dia: "2026-11-23", hora: "10:00", ordemDeChegada: false }],
    });
  });

  it("não consulta o provedor para uma conversa invisível à sessão", async () => {
    mocks.conversation.mockResolvedValue({ data: null, error: null });
    expect((await GET(request())).status).toBe(404);
    expect(mocks.requestAmigo).not.toHaveBeenCalled();
  });

  it("exige recarregar a visão quando muda a conta do Amigo", async () => {
    expect((await GET(request("anterior"))).status).toBe(409);
    expect(mocks.requestAmigo).not.toHaveBeenCalled();
  });
});
