import { z } from "zod";

import { formatPence, MAX_PENCE } from "../ledger/money";
import { WHOLE } from "../ledger/splits";
import { DUE_DAY_MAX, DUE_DAY_MIN } from "./dates";

/**
 * What the template form and the actions accept (SPEC-recurring R3 to R5, R7, R10, R11, R22).
 * These give a person a clear message first; the database checks the same limits again.
 */

export const TEMPLATE_NAME_MAX = 50;
export const ROOM_NAME_MAX = 30;

const control = /[\u0000-\u001f\u007f]/;
// guid, not uuid: accepts every 8-4-4-4-12 id, as the database does.
const id = z.guid("Choose a person.");

const name = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter a name.")
      .max(TEMPLATE_NAME_MAX, `Use ${TEMPLATE_NAME_MAX} characters or fewer.`)
      .refine(
        (value) => !control.test(value),
        "Use letters, numbers and ordinary punctuation only.",
      ),
  );

const dueDay = z
  .number("Choose the day of the month.")
  .int("Choose the day of the month.")
  .min(DUE_DAY_MIN, `The due day is between ${DUE_DAY_MIN} and ${DUE_DAY_MAX}.`)
  .max(DUE_DAY_MAX, `The due day is between ${DUE_DAY_MIN} and ${DUE_DAY_MAX}.`);

const pence = (label: string) =>
  z
    .number(`Enter ${label}.`)
    .int(`Enter ${label} in whole pence.`)
    .min(1, `${label[0].toUpperCase()}${label.slice(1)} must be at least 1p.`)
    .max(
      MAX_PENCE,
      `${label[0].toUpperCase()}${label.slice(1)} can be at most ${formatPence(MAX_PENCE)}.`,
    );

const activeMonths = z
  .array(z.number().int().min(1).max(12))
  .min(1, "Choose at least one month.")
  .transform((months) => [...new Set(months)].sort((a, b) => a - b));

const unique = (values: string[]) => new Set(values).size === values.length;

const billSchema = z
  .object({
    kind: z.literal("bill"),
    name,
    paidBy: id,
    dueDay,
    amountMode: z.enum(["fixed", "variable"]),
    amountPence: pence("the amount").nullable().default(null),
    splitMode: z.enum(["equal", "percent"]),
    /** Equal bills: who shares it (empty means everyone in the flat). Percent bills: who and how much. */
    people: z.array(
      z.object({ profileId: id, basisPoints: z.number().int().min(0).max(WHOLE).optional() }),
    ),
    activeMonths,
  })
  .superRefine((bill, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });

    if (bill.amountMode === "fixed" && bill.amountPence === null) {
      issue("Enter the amount for a fixed bill.", ["amountPence"]);
    }
    if (bill.amountMode === "variable" && bill.amountPence !== null) {
      issue("A bill that changes each month has no fixed amount.", ["amountPence"]);
    }
    if (!unique(bill.people.map((p) => p.profileId))) {
      issue("Each person can only appear once.", ["people"]);
    }
    if (bill.splitMode === "percent") {
      if (bill.people.length === 0) issue("Choose who shares this bill.", ["people"]);
      const sum = bill.people.reduce((total, p) => total + (p.basisPoints ?? 0), 0);
      if (bill.people.length > 0 && sum !== WHOLE) {
        issue(`The percentages must add up to 100%. They add up to ${sum / 100}%.`, ["people"]);
      }
    }
  });

const rentSchema = z
  .object({
    kind: z.literal("rent"),
    name,
    collectorId: id,
    dueDay,
    rooms: z
      .array(
        z.object({
          name: z
            .string()
            .transform((value) => value.trim())
            .pipe(
              z
                .string()
                .min(1, "Name each room.")
                .max(ROOM_NAME_MAX, `Use ${ROOM_NAME_MAX} characters or fewer for a room name.`),
            ),
          rentPence: pence("the room's rent"),
          occupantIds: z.array(id).min(1, "Choose who lives in each room."),
        }),
      )
      .min(1, "Add at least one room."),
    /** An admin may type a person's amount instead of their room's share; the room is then a label. */
    custom: z.array(z.object({ profileId: id, pence: pence("the amount") })).default([]),
    activeMonths,
  })
  .superRefine((rent, ctx) => {
    const occupants = rent.rooms.flatMap((room) => room.occupantIds);
    if (!unique(occupants)) {
      ctx.addIssue({
        code: "custom",
        message: "Each person can only live in one room.",
        path: ["rooms"],
      });
    }
    if (!unique(rent.custom.map((c) => c.profileId))) {
      ctx.addIssue({
        code: "custom",
        message: "Each person can only appear once.",
        path: ["custom"],
      });
    }
  });

export const templateSchema = z.discriminatedUnion("kind", [billSchema, rentSchema]);

export type TemplateInput = z.input<typeof templateSchema>;
export type TemplateValue = z.output<typeof templateSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, input: unknown, fallback: string): Parsed<T> {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? fallback };
}

/** Validates a rent or bill template as typed into the form. */
export function parseTemplate(input: unknown): Parsed<TemplateValue> {
  return parseWith(templateSchema, input, "Check the details and try again.");
}

/** The payer of a variable bill types this month's amount. */
export const billAmountSchema = z.object({ instanceId: id, amountPence: pence("the amount") });
export function parseBillAmount(input: unknown) {
  return parseWith(billAmountSchema, input, "Enter an amount like 4.20.");
}

/** "I paid my rent". The cap (what is still owed) is checked by the database and the form. */
export const rentPaymentSchema = z.object({ amountPence: pence("the amount") });
export function parseRentPayment(input: unknown) {
  return parseWith(rentPaymentSchema, input, "Enter an amount like 520.00.");
}

/** A waiver closes rent that will not be paid, and needs a reason. */
export const waiverSchema = z.object({
  payerId: id,
  amountPence: pence("the amount"),
  reason: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Say why.").max(200, "Use 200 characters or fewer.")),
});
export function parseWaiver(input: unknown) {
  return parseWith(waiverSchema, input, "Check the details and try again.");
}

/** Skip one upcoming month of a template. */
export const skipSchema = z.object({
  templateId: id,
  period: z.string().regex(/^\d{4}-\d{2}-01$/, "Choose a month."),
});
export function parseSkip(input: unknown) {
  return parseWith(skipSchema, input, "Choose a month.");
}
