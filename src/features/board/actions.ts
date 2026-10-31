"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getMembership } from "@/features/household/membership";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { BoardFormState } from "./constants";
import { boardErrorMessage, isExpectedBoardError } from "./errors";
import { parsePostFields, parsePostId } from "./schemas";

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fboard");
  return supabase;
}

/** Posts a note. The form is checked here for friendly messages; the database checks again. */
export async function postNote(
  _previous: BoardFormState,
  formData: FormData,
): Promise<BoardFormState> {
  const membership = await getMembership();
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";
  const body = formData.get("body");
  const days = formData.get("days");
  const parsed = parsePostFields(
    {
      body: typeof body === "string" ? body : "",
      days: typeof days === "string" ? days : "",
      pin: formData.get("pin") === "on",
    },
    isAdmin,
  );
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const supabase = await signedInClient();
  const { error } = await supabase.rpc("post_to_board", {
    p_body: parsed.value.body,
    p_expires_in_days: parsed.value.days,
    p_pin: parsed.value.pin,
  });
  if (error) {
    if (!isExpectedBoardError(error)) logger.error("board.post_failed", { error });
    return { status: "error", message: boardErrorMessage(error) };
  }
  revalidatePath("/more/board");
  return { status: "saved" };
}

export async function deletePost(formData: FormData): Promise<void> {
  const id = parsePostId(formData.get("postId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("delete_board_post", { p_post: id });
  if (error && !isExpectedBoardError(error)) logger.error("board.delete_failed", { error });
  revalidatePath("/more/board");
}

export async function setPinned(formData: FormData): Promise<void> {
  const id = parsePostId(formData.get("postId"));
  if (!id) return;
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("pin_board_post", {
    p_post: id,
    p_pinned: formData.get("pinned") === "true",
  });
  if (error && !isExpectedBoardError(error)) logger.error("board.pin_failed", { error });
  revalidatePath("/more/board");
}
