import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { AmigoInboxAgenda } from "./AmigoInboxAgenda";

const mock = vi.hoisted(() => ({ request: vi.fn(), read: vi.fn() }));
vi.mock("@/app/app/integrations/amigo/_api", () => ({
  amigoRequest: mock.request,
  read: mock.read,
  pinAmigoConnection: vi.fn(),
  errorText: String,
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));

describe("Agenda do Amigo na ficha do Inbox", () => {
  it("abre sete dias, carrega o médico padrão e consulta a próxima semana no mesmo painel", async () => {
    mock.request.mockImplementation(async (path: string) => {
      if (path.includes("inicio=")) {
        const start = new URL(path, "http://localhost").searchParams.get("inicio");
        return { occupancy: [{ dia: start, hora: "10:00", ordemDeChegada: false }] };
      }
      return {
        config: { configured: true, active: true, connection_id: "connection", timezone: "America/Fortaleza", default_place_id: 9 },
        next: { title: "Consulta", starts_at: "2026-11-24T10:00:00-03:00" },
      };
    });
    mock.read.mockImplementation(async (op: string) => op === "doctors"
      ? [{ id: 7, name: "Dr. Heli Neto" }, { id: 8, name: "Outro médico" }]
      : [{ id: 9, name: "Currais Novos" }]);
    render(<AmigoInboxAgenda conversationId="conversation" contactId="contact" />);
    expect(await screen.findByText("Consulta · 2026-11-24 10:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver agenda" }));
    const week = within(await screen.findByRole("region", { name: "Ocupação da semana" }));
    expect(week.getAllByRole("heading", { level: 3 })).toHaveLength(7);
    await week.findByText("10:00 · Ocupado");
    expect(week.getByLabelText("Médico da agenda")).toHaveValue("7");
    const firstQuery = mock.request.mock.calls.find(([path]) => path.includes("inicio="))![0];
    fireEvent.click(week.getByRole("button", { name: "Próxima semana" }));
    await waitFor(() => expect(mock.request.mock.calls.filter(([path]) => path.includes("inicio="))).toHaveLength(2));
    const latest = mock.request.mock.calls.at(-1)![0];
    expect(latest).not.toBe(firstQuery);
    expect(latest).toContain("medico=7");
    expect(week.getAllByRole("heading", { level: 3 })).toHaveLength(7);
  });
});
