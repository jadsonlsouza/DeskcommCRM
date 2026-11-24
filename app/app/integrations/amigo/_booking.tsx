"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { read } from "./_api";
import { useAmigoMutation, useLoad } from "./_hooks";
import { PatientPicker } from "./_patient-picker";
import { Field, MutationNotice, Notice, Panel, Pick, options, civilTime, shifts } from "./_ui";
import type { AmigoSafeConfig, CalendarDay, DoctorSlot, Named, Patient } from "./_types";
import { somarDiasDaSemana } from "@/lib/amigo/inbox-week";

export function AmigoBooking({
  initialConfig: config,
  onSaved,
  contactId,
  disabled = false,
  selectedPatient,
  initialPlace,
  initialDoctor,
  weekStart,
}: {
  initialConfig: AmigoSafeConfig;
  onSaved: () => void;
  contactId?: string;
  disabled?: boolean;
  selectedPatient?: Patient | null;
  initialPlace?: string;
  initialDoctor?: string;
  weekStart?: string;
}) {
  const [pickedPatient, setPatient] = useState<Patient | null>(null);
  const patient = selectedPatient === undefined ? pickedPatient : selectedPatient;
  const [place, setPlace] = useState(initialPlace || String(config.default_place_id ?? ""));
  const [event, setEvent] = useState("");
  const [insurance, setInsurance] = useState("");
  const [product, setProduct] = useState("");
  const [doctor, setDoctor] = useState(initialDoctor ?? "");
  const [specialty, setSpecialty] = useState("");
  const [born, setBorn] = useState("");
  const [gender, setGender] = useState("");
  const [searched, setSearched] = useState(false);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState<DoctorSlot | null>(null);
  const mutation = useAmigoMutation();
  const frozen = disabled || mutation.pending || mutation.blocked;
  const loadPlaces = useCallback(() => read<Named[]>("places"), []);
  const places = useLoad(loadPlaces);
  const loadEvents = useCallback(
    () =>
      read<Named[]>("events", {
        ...(place ? { place_id: Number(place) } : {}),
        only_schedulable: true,
      }),
    [place],
  );
  const events = useLoad(loadEvents, !!place);
  const loadInsurances = useCallback(
    () => read<Named[]>("insurances", { place_id: Number(place) }),
    [place],
  );
  const insurances = useLoad(loadInsurances, !!place);
  const loadProducts = useCallback(
    () => read<Named[]>("insurance_products", { insurance_id: Number(insurance) }),
    [insurance],
  );
  const products = useLoad(loadProducts, !!insurance);
  const loadSpecialties = useCallback(
    () =>
      read<string[]>("specialties", {
        place_id: Number(place),
        ...(insurance ? { insurance_id: Number(insurance) } : {}),
      }),
    [place, insurance],
  );
  const specialties = useLoad(loadSpecialties, !!place);
  const loadDoctors = useCallback(
    () =>
      read<Named[]>("doctors_available", {
        place_id: Number(place),
        event_id: Number(event),
        ...(insurance ? { insurance_id: Number(insurance) } : {}),
        ...(product ? { insurance_product_id: Number(product) } : {}),
        ...(specialty ? { specialty: [specialty] } : {}),
        only_schedulable: true,
      }),
    [place, event, insurance, product, specialty],
  );
  const doctors = useLoad(loadDoctors, !!place && !!event);
  const insuranceInput = {
    ...(insurance ? { insurance_id: Number(insurance) } : {}),
    ...(product ? { insurance_product_id: Number(product) } : {}),
  };
  const datesLoader = useCallback(
    () =>
      read<(string | DoctorSlot)[]>("doctor_dates", {
        id: Number(doctor),
        event_id: Number(event),
        place_id: Number(place),
        patient_id: patient?.id,
        ...(insurance ? { insurance_id: Number(insurance) } : {}),
        ...(product ? { insurance_product_id: Number(product) } : {}),
        ...(config.allow_same_day === undefined ? {} : { allow_same_day: config.allow_same_day }),
        ...(config.months_ahead ? { months_ahead: config.months_ahead } : {}),
        ...(gender ? { gender } : {}),
        ...(born ? { born } : {}),
      }),
    [
      doctor,
      event,
      place,
      patient?.id,
      insurance,
      product,
      config.allow_same_day,
      config.months_ahead,
      gender,
      born,
    ],
  );
  const dates = useLoad(datesLoader, searched);
  const slotsForDay = useCallback(
    (date: string) =>
      read<(string | DoctorSlot)[]>("doctor_dates", {
        id: Number(doctor),
        event_id: Number(event),
        place_id: Number(place),
        patient_id: patient?.id,
        date,
        ...(insurance ? { insurance_id: Number(insurance) } : {}),
        ...(product ? { insurance_product_id: Number(product) } : {}),
        ...(config.allow_same_day === undefined ? {} : { allow_same_day: config.allow_same_day }),
        ...(config.months_ahead ? { months_ahead: config.months_ahead } : {}),
        ...(gender ? { gender } : {}),
        ...(born ? { born } : {}),
      }),
    [
      doctor,
      event,
      place,
      patient?.id,
      insurance,
      product,
      config.allow_same_day,
      config.months_ahead,
      gender,
      born,
    ],
  );
  const slotsLoader = useCallback(() => slotsForDay(day), [slotsForDay, day]);
  const slots = useLoad(slotsLoader, !weekStart && searched && !!day);
  const calendarLoader = useCallback(
    () =>
      read<CalendarDay[]>("calendar", {
        place_id: Number(place),
        event_id: Number(event),
        patient_id: patient?.id,
        ...(insurance ? { insurance_id: Number(insurance) } : {}),
        ...(product ? { insurance_product_id: Number(product) } : {}),
      }),
    [place, event, patient?.id, insurance, product],
  );
  const calendar = useLoad(calendarLoader, !weekStart && searched);
  const resetAvailability = () => {
    setSearched(false);
    setDay("");
    setSlot(null);
  };
  const dayOptions = [
    ...new Set(
      (dates.data ?? []).map((value) =>
        typeof value === "string"
          ? `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}`
          : civilTime(value.formatted_start_date ?? value.start_date, config.timezone).slice(0, 10),
      ),
    ),
  ]
    .filter(Boolean)
    .sort()
    .map((value) => ({
      value,
      label: `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`,
    }));
  const datesData = dates.data;
  const timezone = config.timezone;
  const loadWeekSlots = useCallback(async () => {
    if (!weekStart || !datesData) return null;
    const end = somarDiasDaSemana(weekStart, 6);
    const availableDays = new Set(datesData.map((value) =>
      typeof value === "string"
        ? `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}`
        : civilTime(value.formatted_start_date ?? value.start_date, timezone).slice(0, 10),
    ).filter((date) => date >= weekStart && date <= end));
    const results = await Promise.all([...availableDays].map(slotsForDay));
    return { week: weekStart, slots: results.flat() };
  }, [datesData, slotsForDay, timezone, weekStart]);
  const weekSlots = useLoad(loadWeekSlots, !!weekStart && searched && !!datesData && !dates.loading);
  const matchingWeek = weekSlots.data?.week === weekStart ? weekSlots.data : null;
  const availableSlots = ((weekStart ? matchingWeek?.slots : slots.data) ?? []).filter(
    (value): value is DoctorSlot =>
      typeof value !== "string" &&
      value.user_id === Number(doctor) &&
      (!value.place_id || value.place_id === Number(place)) &&
      (Boolean(weekStart) || civilTime(value.formatted_start_date ?? value.start_date, config.timezone).startsWith(day)),
  );
  const selectedSlot = slot && (!weekStart ||
    (!weekSlots.loading && availableSlots.some((candidate) => candidate.id === slot.id))) ? slot : null;
  const create = async () => {
    if (!selectedSlot || !patient) return;
    const result = await mutation.run(
      "attendance_create",
      {
        patient_id: patient.id,
        place_id: Number(place),
        event_id: Number(event),
        user_id: Number(doctor),
        ...insuranceInput,
        start_date: civilTime(selectedSlot.formatted_start_date ?? selectedSlot.start_date, config.timezone),
        ...(config.allow_same_day === undefined ? {} : { allow_same_day: config.allow_same_day }),
      },
      contactId,
    );
    if (result) {
      resetAvailability();
      onSaved();
    }
  };
  return (
    <Panel
      title="Nova consulta"
      description={`Escolha recursos da clínica e uma vaga retornada pelo Amigo. Horários em ${config.timezone}.`}
    >
      {selectedPatient === undefined && <PatientPicker
        selected={patient}
        disabled={frozen}
        contactId={contactId}
        onSelect={(value) => {
          setPatient(value);
          resetAvailability();
        }}
      />}
      <fieldset disabled={frozen} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Pick
            label="Unidade"
            value={place}
            options={options(places.data)}
            onChange={(e) => {
              setPlace(e.target.value);
              setEvent("");
              setInsurance("");
              setProduct("");
              setDoctor(initialDoctor ?? "");
              setSpecialty("");
              resetAvailability();
            }}
          />
          <Pick
            label="Tipo de atendimento"
            value={event}
            disabled={!place || events.loading}
            options={options(events.data)}
            onChange={(e) => {
              setEvent(e.target.value);
              setDoctor(initialDoctor ?? "");
              resetAvailability();
            }}
          />
          <Pick
            label="Convênio"
            value={insurance}
            disabled={!place || insurances.loading}
            placeholder="Sem convênio / particular"
            options={options(insurances.data)}
            onChange={(e) => {
              setInsurance(e.target.value);
              setProduct("");
              setDoctor("");
              setSpecialty("");
              resetAvailability();
            }}
          />
          <Pick
            label="Produto do convênio"
            value={product}
            disabled={!insurance || products.loading}
            placeholder="Sem produto específico"
            options={options(products.data)}
            onChange={(e) => {
              setProduct(e.target.value);
              setDoctor("");
              resetAvailability();
            }}
          />
          <Pick
            label="Especialidade"
            value={specialty}
            options={(specialties.data ?? []).map((value) => ({ value, label: value }))}
            placeholder="Todas as especialidades"
            onChange={(e) => {
              setSpecialty(e.target.value);
              setDoctor("");
              resetAvailability();
            }}
          />
          <Pick
            label="Médico"
            value={doctor}
            disabled={!event || doctors.loading}
            options={options(doctors.data)}
            onChange={(e) => {
              setDoctor(e.target.value);
              resetAvailability();
            }}
          />
        </div>
        <details>
          <summary className="cursor-pointer text-sm">
            Filtros adicionais de disponibilidade
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Nascimento para consultar vagas">
              <Input
                type="date"
                value={born}
                onChange={(e) => {
                  setBorn(e.target.value);
                  resetAvailability();
                }}
              />
            </Field>
            <Pick
              label="Sexo para consultar vagas"
              value={gender}
              options={["Masculino", "Feminino"].map((value) => ({ value, label: value }))}
              placeholder="Não informar"
              onChange={(e) => {
                setGender(e.target.value);
                resetAvailability();
              }}
            />
          </div>
        </details>
        <Button
          type="button"
          variant="outline"
          disabled={!patient || !doctor || !event || !place || frozen || (Boolean(weekStart) &&
            !doctors.data?.some((item) => item.id === Number(doctor)))}
          onClick={() => {
            setDay("");
            setSlot(null);
            setSearched(true);
            if (searched) void dates.refresh();
          }}
        >
          Consultar disponibilidade
        </Button>
        <Notice
          error={
            places.error ||
            events.error ||
            insurances.error ||
            products.error ||
            doctors.error ||
            specialties.error ||
            dates.error ||
            slots.error ||
            weekSlots.error ||
            calendar.error
          }
          loading={dates.loading || slots.loading || calendar.loading || weekSlots.loading}
        />
        {searched && !dates.loading && !weekStart && (
          <>
            <Pick
              label="Dia disponível"
              value={day}
              options={dayOptions}
              onChange={(e) => {
                setDay(e.target.value);
                setSlot(null);
              }}
            />
            {dates.data?.length === 0 && (
              <p className="text-sm">
                Sem datas disponíveis para estes filtros. Ajuste as seleções e consulte novamente.
              </p>
            )}
          </>
        )}
        {day && !slots.loading && !weekStart && (
          <div className="flex flex-wrap gap-2" aria-label="Vagas disponíveis">
            {availableSlots.map((value) => (
              <Button
                key={value.id}
                type="button"
                variant={slot?.id === value.id ? "default" : "outline"}
                aria-pressed={slot?.id === value.id}
                onClick={() => setSlot(value)}
              >
                {value.is_arrival_order
                  ? `${shifts[value.shift ?? ""] ?? "Turno"} · ordem de chegada`
                  : civilTime(
                      value.formatted_start_date ?? value.start_date,
                      config.timezone,
                    ).slice(11)}
                {value.end_date
                  ? ` até ${civilTime(value.end_date, config.timezone).slice(11)}`
                  : ""}
              </Button>
            ))}
            {!slots.error && availableSlots.length === 0 && (
              <p className="text-sm">
                Sem vagas neste dia. Escolha outra data ou consulte novamente.
              </p>
            )}
          </div>
        )}
        {weekStart && searched && !dates.loading && !weekSlots.loading && matchingWeek && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Vagas da semana">
            {Array.from({ length: 7 }, (_, index) => somarDiasDaSemana(weekStart, index)).map((date) => {
              const choices = availableSlots.filter((value) =>
                civilTime(value.formatted_start_date ?? value.start_date, timezone).startsWith(date));
              return (
                <div className="min-w-0 space-y-2 rounded-md border p-2" key={date}>
                  <p className="text-xs font-medium">{date.slice(8)}/{date.slice(5, 7)}</p>
                  {choices.length === 0 && <p className="text-xs text-muted-foreground">Sem vagas retornadas</p>}
                  {choices.map((value) => (
                    <Button
                      key={value.id}
                      type="button"
                      variant={selectedSlot?.id === value.id ? "default" : "outline"}
                      aria-pressed={selectedSlot?.id === value.id}
                      className="h-auto min-h-9 w-full whitespace-normal px-2 py-1 text-xs"
                      onClick={() => { setDay(date); setSlot(value); }}
                    >
                      {value.is_arrival_order
                        ? `${shifts[value.shift ?? ""] ?? "Turno"} · chegada`
                        : civilTime(value.formatted_start_date ?? value.start_date, timezone).slice(11)}
                    </Button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {calendar.data && (
          <p className="text-xs text-muted-foreground">
            Calendário consultado para a unidade e o atendimento selecionados. A marcação usa a vaga
            validada do médico.
          </p>
        )}
        {selectedSlot && (
          <div className="rounded-md border p-4 text-sm">
            <p className="font-medium">
              {patient?.name} · {events.data?.find((x) => x.id === Number(event))?.name} ·{" "}
              {doctors.data?.find((x) => x.id === Number(doctor))?.name}
            </p>
            <p>
              {day.split("-").reverse().join("/")} ·{" "}
              {places.data?.find((x) => x.id === Number(place))?.name}
            </p>
            {selectedSlot.is_arrival_order && (
              <p>
                Atendimento por ordem de chegada, sem promessa de hora exata. Turno:{" "}
                {shifts[selectedSlot.shift ?? ""] ?? "conferir com a clínica"}.
              </p>
            )}
          </div>
        )}
        <Button disabled={!selectedSlot || frozen} onClick={() => void create()}>
          Agendar no Amigo
        </Button>
      </fieldset>
      <MutationNotice mutation={mutation} success="Consulta confirmada no Amigo." />
    </Panel>
  );
}
