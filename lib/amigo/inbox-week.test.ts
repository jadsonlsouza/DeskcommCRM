import { describe, expect, it } from "vitest";
import { inicioDaSemanaAmigo, ocupacaoSemDadosDoPaciente, somarDiasDaSemana } from "./inbox-week";

describe("agenda semanal do Inbox", () => {
  it("abre na semana do fuso da clínica e navega por sete datas civis", () => {
    const now = new Date("2026-11-29T01:00:00Z");
    expect(inicioDaSemanaAmigo(now, "America/Fortaleza")).toBe("2026-11-22");
    expect(somarDiasDaSemana("2026-12-27", 7)).toBe("2027-01-03");
  });

  it("devolve só horários ocupados no intervalo, no fuso da agenda e sem identificar pacientes", () => {
    const patient = { id: 40, name: "Paciente fictício" };
    expect(ocupacaoSemDadosDoPaciente([
      { id: 1, patient, user_id: 4, start_date: "2026-11-23T02:10:00Z" },
      { id: 2, patient, user_id: 4, start_date: "2026-11-23T10:00:00", is_arrival_order: true },
      { id: 3, patient, user_id: 5, start_date: "2026-11-23T08:00:00" },
      { id: 4, patient, user_id: 4, start_date: "2026-11-24T08:00:00", status: "canceled" },
      { id: 5, patient, user_id: 4, start_date: "2026-11-29T08:00:00" },
    ], { start: "2026-11-22", end: "2026-11-28", doctor: 4 }, "America/Fortaleza")).toEqual([
      { dia: "2026-11-22", hora: "23:10", ordemDeChegada: false },
      { dia: "2026-11-23", hora: null, ordemDeChegada: true },
    ]);
  });
});
