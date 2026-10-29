"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { originFromHeaders } from "@/features/identity/origin";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { CreateFlatState, CreateInviteState, SimpleState } from "./constants";
import { buildInviteLink, extractInviteToken, isInviteToken } from "./invite-link";
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

/**
 * Makes a new invite link (replacing any old one). The token exists in clear text only in this
 * response; the database keeps a hash, so the link cannot be shown again later.
 */
export async function createInvite(
  _previous: CreateInviteState,
  _formData: FormData,
): Promise<CreateInviteState> {
  void _formData;
  const origin = originFromHeaders(await headers());
  if (!origin) return { status: "error", message: "We couldn’t make a link. Please try again." };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in?next=%2Fmore%2Fflat");

  const { data: token, error } = await supabase.rpc("create_invite");
  if (error || typeof token !== "string") {
    if (error?.code === "42501") {
      return { status: "error", message: "Only the owner and admins can invite people." };
    }
    logger.error("household.invite_create_failed", { error });
    return { status: "error", message: "We couldn’t make a link. Please try again." };
  }

  revalidatePath("/more/flat");
  return { status: "created", url: buildInviteLink(origin, token) };
}

/** Switches the current invite link off. */
export async function revokeInvite(
  _previous: SimpleState,
  _formData: FormData,
): Promise<SimpleState> {
  void _formData;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_invite");
  if (error) {
    logger.error("household.invite_revoke_failed", { error });
    return { status: "error", message: "We couldn’t switch the link off. Please try again." };
  }
  revalidatePath("/more/flat");
  return { status: "idle" };
}

/** Joins the flat behind an invite. Only ever reached by a form POST, never by opening the link. */
export async function joinHousehold(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const token = formData.get("token");
  if (!isInviteToken(token)) return { status: "error", message: INVALID_INVITE };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/sign-in");

  const { error } = await supabase.rpc("join_household", { p_token: token });
  if (error) {
    if (error.code === "P0001") {
      if (error.message === "already_in_household") {
        return {
          status: "error",
          message: "You are already in a flat. Leave it before joining another.",
        };
      }
      if (error.message === "household_full") {
        return { status: "error", message: "This flat is full." };
      }
      if (error.message === "invalid_invite") return { status: "error", message: INVALID_INVITE };
    }
    logger.error("household.join_failed", { error });
    return { status: "error", message: "We couldn’t add you. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Takes a pasted link (or bare token) and opens its join page. */
export async function openInvite(_previous: SimpleState, formData: FormData): Promise<SimpleState> {
  const token = extractInviteToken(formData.get("link"));
  if (!token) return { status: "error", message: "That doesn’t look like an invite link." };
  redirect(`/join/${token}`);
}

const INVALID_INVITE = "This invite link isn’t valid any more. Ask your flatmate for a new one.";

const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEMBER_ERRORS: Record<string, string> = {
  not_allowed: "You can’t do that in this flat.",
  owner_is_fixed: "The owner’s role can’t be changed.",
  not_a_member: "That person is no longer in the flat.",
};

function memberError(error: { code?: string; message: string }): SimpleState {
  return {
    status: "error",
    message: MEMBER_ERRORS[error.message] ?? "Something went wrong. Please try again.",
  };
}

/** Promotes a member to admin or demotes an admin to member. */
export async function setMemberRole(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const profileId = formData.get("profileId");
  const role = formData.get("role");
  if (typeof profileId !== "string" || !PROFILE_ID.test(profileId)) {
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (role !== "admin" && role !== "member") {
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_profile_id: profileId,
    p_role: role,
  });
  if (error) {
    logger.error("household.set_role_failed", { error });
    return memberError(error);
  }
  revalidatePath("/more/flat");
  return { status: "idle" };
}

/** Removes someone from the flat. */
export async function removeMember(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || !PROFILE_ID.test(profileId)) {
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_member", { p_profile_id: profileId });
  if (error) {
    logger.error("household.remove_failed", { error });
    return memberError(error);
  }
  revalidatePath("/more/flat");
  return { status: "idle" };
}

const LEAVE_ERRORS: Record<string, string> = {
  owner_must_transfer: "Hand the flat to someone else before you leave.",
  owner_must_close: "You are the only one here. Close the flat instead.",
  cannot_leave: "You can’t leave yet. Settle up with your flatmates first.",
  flat_not_empty: "Other people are still in the flat.",
  not_a_member: "That person is no longer in the flat.",
  use_leave: "Choose someone else.",
  not_allowed: "You can’t do that in this flat.",
};

function leaveError(error: { message: string }): SimpleState {
  return {
    status: "error",
    message: LEAVE_ERRORS[error.message] ?? "Something went wrong. Please try again.",
  };
}

/** Leaves the flat, then back to Home where the person can create or join another. */
export async function leaveHousehold(
  _previous: SimpleState,
  _formData: FormData,
): Promise<SimpleState> {
  void _formData;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("leave_household");
  if (error) {
    logger.error("household.leave_failed", { error });
    return leaveError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** The owner hands the flat to another member and becomes an admin. */
export async function transferOwnership(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || !PROFILE_ID.test(profileId)) {
    return { status: "error", message: "Choose who should take over." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transfer_ownership", { p_profile_id: profileId });
  if (error) {
    logger.error("household.transfer_failed", { error });
    return leaveError(error);
  }
  revalidatePath("/", "layout");
  return { status: "idle" };
}

/** Closes a flat the owner is alone in. */
export async function closeHousehold(
  _previous: SimpleState,
  _formData: FormData,
): Promise<SimpleState> {
  void _formData;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("close_household");
  if (error) {
    logger.error("household.close_failed", { error });
    return leaveError(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
