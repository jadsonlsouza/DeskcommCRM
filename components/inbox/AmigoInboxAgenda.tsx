"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AttendanceList } from "@/app/app/integrations/amigo/_agenda";
import { AmigoBooking } from "@/app/app/integrations/amigo/_booking";
import { amigoRequest, errorText, pinAmigoConnection, read } from "@/app/app/integrations/amigo/_api";
import { useLoad } from "@/app/app/integrations/amigo/_hooks";
import { AmigoMutationBoundary, useMutationBlock } from "@/app/app/integrations/amigo/_mutation-boundary";
import { PatientPicker } from "@/app/app/integrations/amigo/_patient-picker";
import { PatientForm } from "@/app/app/integrations/amigo/_patients";
import { civilTime, Notice, options, Pick } from "@/app/app/integrations/amigo/_ui";
import type { AmigoSafeConfig, Attendance, Named, Patient } from "@/app/app/integrations/amigo/_types";
import { inicioDaSemanaAmigo, somarDiasDaSemana, type AmigoOcupacao } from "@/lib/amigo/inbox-week";

type Overview = {
  config: AmigoSafeConfig;
  next: { title: string; starts_at: string } | null;
  patientIds?: number[];
};

const dayLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC",
});

export function AmigoInboxAgenda({ conversationId, contactId, phone }: {
  conversationId: string;
  contactId: string;
  phone?: string | null;
}) {
  const [mode, setMode] = useState<"agenda" | "booking" | null>(null);
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const loadOverview = useCallback(
    () => amigoRequest<Overview>(`/inbox-agenda?conversa=${conversationId}`), [conversationId],
  );
  const overview = useLoad(loadOverview);
  const config = overview.data?.config;
  const connection = config?.connection_id;
  useLayoutEffect(() => {
    if (!opened || !connection) return;
    pinAmigoConnection(connection);
    return () => pinAmigoConnection(null);
  }, [opened, connection]);
  if (!config?.active || !config.configured) {
    if (!overview.data && !overview.error) return null;
    return <Link className="underline" href={`/app/agenda?contato=${contactId}&conversa=${conversationId}`}>Marcar compromisso</Link>;
  }
  const open = (next: "agenda" | "booking", trigger: HTMLButtonElement) => {
    opener.current = trigger;
    setOpened(true);
    setMode(next);
  };
  return (
    <div className="w-full space-y-2 rounded-md border bg-muted/20 p-2">
      <p className="text-xs font-semibold">Agenda do Amigo</p>
      <p className="text-xs text-muted-foreground">
        {overview.data?.next
          ? `${overview.data.next.title} · ${civilTime(overview.data.next.starts_at, config.timezone)}`
          : "Sem próximo compromisso vinculado"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={(e) => open("agenda", e.currentTarget)}>Ver agenda</Button>
        <Button type="button" size="sm" onClick={(e) => open("booking", e.currentTarget)}>Agendar</Button>
      </div>
      <AmigoMutationBoundary>
        <Sheet open={mode !== null} onOpenChange={(visible) => { if (!visible) setMode(null); }}>
          {opened && (
            <SheetContent
              side="right"
              className="w-full overflow-y-auto sm:max-w-[min(92vw,72rem)]"
              onCloseAutoFocus={(e) => { e.preventDefault(); opener.current?.focus(); }}
            >
              <div className="space-y-5">
                <div className="space-y-1 pr-8">
                  <SheetTitle>Agenda do Amigo</SheetTitle>
                  <SheetDescription>Consulte a semana e gerencie os compromissos desta conversa.</SheetDescription>
                </div>
                <WeeklyAgenda
                  key={config.connection_id}
                  config={config}
                  conversationId={conversationId}
                  contactId={contactId}
                  phone={phone}
                  patientIds={overview.data?.patientIds ?? []}
                  startBooking={mode === "booking"}
                  onChanged={() => void overview.refresh()}
                />
              </div>
            </SheetContent>
          )}
        </Sheet>
      </AmigoMutationBoundary>
    </div>
  );
}

function WeeklyAgenda({
  config, conversationId, contactId, phone, patientIds, startBooking, onChanged,
}: {
  config: AmigoSafeConfig;
  conversationId: string;
  contactId: string;
  phone?: string | null;
  patientIds: number[];
  startBooking: boolean;
  onChanged: () => void;
}) {
  const [week, setWeek] = useState(() => inicioDaSemanaAmigo(new Date(), config.timezone));
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [place, setPlace] = useState(String(config.default_place_id ?? ""));
  const [patient, setPatient] = useState<Patient | null>(null);
  const [creating, setCreating] = useState(false);
  const [booking, setBooking] = useState(startBooking);
  const loadDoctors = useCallback(() => read<Named[]>("doctors"), []);
  const loadPlaces = useCallback(() => read<Named[]>("places"), []);
  const doctors = useLoad(loadDoctors);
  const places = useLoad(loadPlaces);
  const preferredDoctor = doctors.data?.find((doctor) =>
    /\bheli\b.*\bneto\b/i.test(doctor.name?.normalize("NFD").replace(/\p{M}/gu, "") ?? "")) ??
    (doctors.data?.length === 1 ? doctors.data[0] : undefined);
  const doctor = selectedDoctor ?? String(preferredDoctor?.id ?? "");
  const loadOccupancy = useCallback(async () => {
    const params = new URLSearchParams({ conversa: conversationId, inicio: week, medico: doctor });
    if (place) params.set("unidade", place);
    const result = await amigoRequest<{ occupancy: AmigoOcupacao[] }>(`/inbox-agenda?${params}`);
    return { week, doctor, place, rows: result.occupancy };
  }, [conversationId, week, doctor, place]);
  const occupancy = useLoad(loadOccupancy, !!doctor);
  const matchingOccupancy = occupancy.data?.week === week && occupancy.data.doctor === doctor &&
    occupancy.data.place === place ? occupancy.data.rows : null;
  const patientId = patient?.id;
  const weekEnd = somarDiasDaSemana(week, 6);
  const loadAppointments = useCallback(async () => ({
    patientId,
    week,
    items: await read<Attendance[]>("patient_attendances", {
      patient_id: patientId,
      start_date: week,
      end_date: weekEnd,
    }, contactId),
  }), [patientId, contactId, week, weekEnd]);
  const linked = patient !== null && patientIds.includes(patient.id);
  const appointments = useLoad(loadAppointments, linked);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [linkError, setLinkError] = useState("");
  const linkLock = useRef(false);
  const mutationBlock = useMutationBlock();

  const refresh = () => {
    onChanged();
    if (doctor) void occupancy.refresh();
    if (linked) void appointments.refresh();
  };
  const linkPatient = async () => {
    if (!patient || linkLock.current || mutationBlock?.blocked) return;
    linkLock.current = true;
    setLinkingId(patient.id);
    setLinkError("");
    try {
      await amigoRequest("/links", "POST", { patient_id: patient.id, contact_id: contactId });
      onChanged();
    } catch (error) {
      setLinkError(errorText(error));
    } finally {
      linkLock.current = false;
      setLinkingId(null);
    }
  };
  const days = Array.from({ length: 7 }, (_, index) => somarDiasDaSemana(week, index));
  return (
    <>
      <section className="space-y-3" aria-label="Ocupação da semana">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setWeek(somarDiasDaSemana(week, -7))}>Semana anterior</Button>
          <Button type="button" variant="outline" onClick={() => setWeek(inicioDaSemanaAmigo(new Date(), config.timezone))}>Semana atual</Button>
          <Button type="button" variant="outline" onClick={() => setWeek(somarDiasDaSemana(week, 7))}>Próxima semana</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Pick label="Médico da agenda" value={doctor} options={options(doctors.data)} onChange={(e) => setSelectedDoctor(e.target.value)} />
          <Pick label="Unidade da agenda" value={place} placeholder="Todas as unidades" options={options(places.data)} onChange={(e) => setPlace(e.target.value)} />
        </div>
        <Notice error={doctors.error || places.error || occupancy.error} loading={occupancy.loading} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {days.map((date) => {
            const occupied = matchingOccupancy?.filter((row) => row.dia === date);
            return (
              <section className="min-w-0 space-y-2 rounded-md border p-2" key={date}>
                <h3 className="text-sm font-semibold capitalize">{dayLabel.format(new Date(date + "T12:00:00Z"))}</h3>
                <p className="text-xs text-muted-foreground">
                  {!doctor ? "Escolha o médico" : occupied ? `${occupied.length} compromisso(s)`
                    : occupancy.error ? "Ocupação indisponível" : "Consultando…"}
                </p>
                {occupied?.map((slot, index) => (
                  <p className="rounded bg-muted px-1.5 py-1 text-xs" key={index}>
                    {slot.ordemDeChegada ? "Ordem de chegada" : slot.hora} · Ocupado
                  </p>
                ))}
              </section>
            );
          })}
        </div>
      </section>
      <section className="space-y-3 rounded-md border p-3" aria-label="Paciente desta conversa">
        <h3 className="font-semibold">Paciente desta conversa</h3>
        <PatientPicker
          initialQuery={phone ?? ""}
          selected={patient}
          disabled={linkingId !== null}
          onSelect={(value) => { setPatient(value); setCreating(false); setLinkError(""); }}
          contactId={contactId}
        />
        {!patient && (
          <Button type="button" variant="outline" disabled={mutationBlock?.blocked} onClick={() => setCreating(!creating)}>
            {creating ? "Fechar cadastro" : "Cadastrar paciente"}
          </Button>
        )}
        {creating && (
          <PatientForm contactId={contactId} onSaved={(value) => {
            setPatient(value);
            setCreating(false);
            onChanged();
          }} />
        )}
        {patient && !linked && (
          <Button type="button" variant="outline" disabled={linkingId !== null || mutationBlock?.blocked} onClick={() => void linkPatient()}>
            Vincular paciente à conversa
          </Button>
        )}
        <Notice error={linkError || appointments.error} loading={linkingId !== null || appointments.loading} />
        {linked && appointments.data?.patientId === patientId && appointments.data?.week === week && (
          <AttendanceList
            items={appointments.data.items.filter((item) =>
              item.start_date && civilTime(item.start_date, config.timezone).slice(0, 10) >= week &&
              civilTime(item.start_date, config.timezone).slice(0, 10) <= weekEnd)}
            timezone={config.timezone}
            contactId={contactId}
            onChanged={refresh}
          />
        )}
      </section>
      {!booking && <Button type="button" onClick={() => setBooking(true)}>Agendar</Button>}
      {booking && (
        <AmigoBooking
          key={JSON.stringify([doctor, place, patient?.id])}
          initialConfig={config}
          initialDoctor={doctor}
          initialPlace={place}
          selectedPatient={linked ? patient : null}
          contactId={contactId}
          weekStart={week}
          onSaved={refresh}
        />
      )}
    </>
  );
}
