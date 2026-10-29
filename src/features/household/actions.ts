"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { CreateFlatState } from "./constants";
import { parseHouseholdName } from "./schemas";

/**
 * Creates a flat with the signed-in person as its owner. The rules (one flat per person, one
 * owner, name length) are enforced by the database function; this only validates for a friendly
 * message and maps the outcome.
 */
export async function createHousehold(
  _previous: CreateFlatState,
  formData: FormData,
): Promise<CreateFlatState> {
  const parsed = parseHouseholdName(formData.get("name"));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fdashboard");

  const { error } = await supabase.rpc("create_household", { p_name: parsed.value });
  if (error) {
    if (error.code === "P0001" && error.message === "already_in_household") {
      return { status: "error", message: "You are already in a flat." };
    }
    logger.error("household.create_failed", { error });
    return { status: "error", message: "We couldn’t create your flat. Please try again." };
  }

  // Every page in the app depends on whether you have a flat.
  revalidatePath("/", "layout");
  return { status: "created" };
}
