import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addMeter: vi.fn(),
  addReading: vi.fn(),
  archiveMeter: vi.fn(),
  cancelReading: vi.fn(),
}));

import { MeterCard } from "./meter-card";
import { MeterForm } from "./meter-form";
import type { Meter, MeterReading } from "./meters";
import { ReadingForm } from "./reading-form";
import { ReadingList } from "./reading-list";

const reading = (
  readOn: string,
  value: number,
  over: Partial<MeterReading> = {},
): MeterReading => ({
  id: readOn,
  readOn,
  value,
  isReset: false,
  voided: false,
  note: null,
  recordedBy: "p-bob",
  recordedByName: "Bob",
  createdAt: `${readOn}T10:00:00Z`,
  ...over,
});

const meter = (readings: MeterReading[]): Meter => ({
  id: "m1",
  kind: "electricity",
  label: "Hall",
  unit: "kWh",
  readings,
});

describe("MeterCard", () => {
  it("shows the latest reading and the last use line", () => {
    render(<MeterCard meter={meter([reading("2026-11-01", 1214), reading("2026-10-01", 1000)])} />);
    expect(screen.getByText("Electricity (Hall)")).toBeInTheDocument();
    expect(screen.getByText("1214 kWh on 2026-11-01")).toBeInTheDocument();
    expect(screen.getByText("Used 214 kWh in 31 days, about 7 a day.")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/more/meters/m1");
  });
  it("says so when there are no readings", () => {
    render(<MeterCard meter={meter([])} />);
    expect(screen.getByText("No readings yet")).toBeInTheDocument();
  });
});

describe("ReadingList", () => {
  const readings = [
    reading("2026-11-01", 1214),
    reading("2026-10-01", 1000, { recordedBy: "p-carol", recordedByName: "Carol" }),
  ];

  it("shows each reading with the use since the one before, newest first", () => {
    render(
      <ReadingList meterId="m1" unit="kWh" readings={readings} viewerId="p-bob" isAdmin={false} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1214 kWh on 2026-11-01");
    expect(items[0]).toHaveTextContent("Used 214 kWh in 31 days");
    expect(items[1]).toHaveTextContent("1000 kWh on 2026-10-01");
    expect(items[1]).not.toHaveTextContent("Used");
  });

  it("offers Cancel on your own readings, and on every reading to admins", () => {
    const { rerender } = render(
      <ReadingList meterId="m1" unit="kWh" readings={readings} viewerId="p-bob" isAdmin={false} />,
    );
    expect(screen.getAllByRole("button", { name: /Cancel the reading/ })).toHaveLength(1);
    rerender(<ReadingList meterId="m1" unit="kWh" readings={readings} viewerId="p-dan" isAdmin />);
    expect(screen.getAllByRole("button", { name: /Cancel the reading/ })).toHaveLength(2);
  });

  it("has an empty state and marks a reset", () => {
    const { rerender } = render(
      <ReadingList meterId="m1" unit="kWh" readings={[]} viewerId="p-bob" isAdmin={false} />,
    );
    expect(screen.getByText(/No readings yet/)).toBeInTheDocument();
    rerender(
      <ReadingList
        meterId="m1"
        unit="kWh"
        readings={[reading("2026-11-01", 5, { isReset: true })]}
        viewerId="p-bob"
        isAdmin={false}
      />,
    );
    expect(screen.getByText(/new or reset meter/)).toBeInTheDocument();
  });
});

describe("ReadingForm", () => {
  it("starts on today with the unit in the label and the no-account-numbers hint", () => {
    render(<ReadingForm meterId="m1" unit="m3" today="2026-11-10" />);
    expect(screen.getByLabelText("Date of the reading")).toHaveValue("2026-11-10");
    expect(screen.getByLabelText("Reading (m³)")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Please don't put account numbers here."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/replaced or did it roll over/)).toBeNull();
  });
});

describe("MeterForm", () => {
  it("offers only kWh for electricity", () => {
    render(<MeterForm />);
    expect(screen.getAllByRole("option", { name: "kWh" })).toHaveLength(1);
    expect(screen.queryByRole("option", { name: "m³" })).toBeNull();
  });
});
