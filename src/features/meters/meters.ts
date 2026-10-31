import "server-only";

import { getRequestSession } from "@/features/identity/session-claims";

import type { Reading } from "./usage";

export interface MeterReading extends Reading {
  note: string | null;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export interface Meter {
  id: string;
  kind: string;
  label: string | null;
  unit: string;
  /** Live readings, newest first. */
  readings: MeterReading[];
}

/** The flat's meters with their live (not cancelled) readings. Row-level security limits both. */
export async function getMeters(): Promise<Meter[]> {
  const { supabase } = await getRequestSession();
  const [meters, readings] = await Promise.all([
    supabase
      .from("meters")
      .select("id, kind, label, unit")
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("meter_readings")
      .select(
        "id, meter_id, read_on, value, is_reset, note, recorded_by, created_at, recorder:profiles!meter_readings_recorded_by_fkey(display_name)",
      )
      .is("voided_at", null)
      .order("read_on", { ascending: false })
      .limit(2000),
  ]);

  return (meters.data ?? []).map((meter) => ({
    ...meter,
    readings: (readings.data ?? [])
      .filter((row) => row.meter_id === meter.id)
      .map((row) => ({
        id: row.id,
        readOn: row.read_on,
        value: Number(row.value),
        isReset: row.is_reset,
        voided: false,
        note: row.note,
        recordedBy: row.recorded_by,
        recordedByName: row.recorder?.display_name ?? "Someone",
        createdAt: row.created_at,
      })),
  }));
}

export async function getMeter(id: string): Promise<Meter | null> {
  return (await getMeters()).find((meter) => meter.id === id) ?? null;
}
