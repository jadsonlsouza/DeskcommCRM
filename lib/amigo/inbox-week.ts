import { diaLocalISO } from "@/lib/agenda/fuso";
import { diaDeHojeNoFuso, semanaSemente } from "@/lib/agenda/semana-semente";
import type { z } from "zod";
import type { amigoResponseSchemas } from "./contracts";

type Attendance = z.infer<typeof amigoResponseSchemas.attendances>[number];

export function somarDiasDaSemana(day: string, days: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inicioDaSemanaAmigo(now: Date, timezone: string) {
  return diaDeHojeNoFuso(semanaSemente(now, timezone).de, timezone);
}

export type AmigoOcupacao = { dia: string; hora: string | null; ordemDeChegada: boolean };

export function ocupacaoSemDadosDoPaciente(
  rows: Attendance[],
  range: { start: string; end: string; doctor: number },
  timezone: string,
): AmigoOcupacao[] {
  const result: AmigoOcupacao[] = [];
  for (const row of rows) {
    if ((row.user_id ?? row.user?.id) !== range.doctor || !row.start_date ||
        row.canceled || row.missed || row.status === "canceled" || row.status === "missed") continue;
    const civil = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(row.start_date)
      ? new Date(row.start_date)
      : null;
    const dia = civil ? diaLocalISO(civil, timezone) : row.start_date.slice(0, 10);
    if (dia < range.start || dia > range.end) continue;
    const ordemDeChegada = row.is_arrival_order ?? row.user?.config_arrival_order ?? false;
    const hora = ordemDeChegada ? null : civil
      ? new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(civil)
      : row.start_date.slice(11, 16);
    result.push({ dia, hora, ordemDeChegada });
  }
  return result.sort((a, b) => (a.dia + (a.hora ?? "")).localeCompare(b.dia + (b.hora ?? "")));
}
