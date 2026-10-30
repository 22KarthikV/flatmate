// Pure request handling for delete-account. No Deno or Supabase imports, so it runs under Vitest
// as well as in the Edge runtime. index.ts wires in the real dependencies.

export interface DeleteAccountDeps {
  /** The user id behind a session token, or null when the token is not a live session. */
  getUserId(accessToken: string): Promise<string | null>;
  /**
   * Takes the person out of their flat (closing it if they are the only one). Answers
   * "owner_must_transfer" and changes nothing when they own a flat that others still live in, and
   * "open_balance" (also changing nothing) while they owe or are owed money or have a payment
   * waiting. Safe to repeat.
   */
  endMemberships(userId: string): Promise<"ok" | "owner_must_transfer" | "open_balance">;
  /** Replaces the person's name and photo with a neutral placeholder and unlinks the row. Safe to repeat. */
  anonymiseProfile(userId: string): Promise<void>;
  /** Removes the sign-in record, which ends every session. */
  deleteAuthUser(userId: string): Promise<void>;
  log(event: string): void;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/**
 * Deletes the caller's own account. The person is identified only by their session token, never by
 * anything in the request body. Their flat membership ends first (an owner of a flat with other
 * people in it is refused with 409 and nothing changes), then the profile is anonymised so shared
 * history survives; if deleting the sign-in then fails the whole call can simply be retried.
 */
export async function handleDeleteAccount(
  request: Request,
  deps: DeleteAccountDeps,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const token = bearerToken(request);
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const userId = await deps.getUserId(token);
    if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

    // Before anything is anonymised: the flat lookup needs the profile still linked to the person.
    const ended = await deps.endMemberships(userId);
    if (ended === "owner_must_transfer" || ended === "open_balance") {
      return json({ ok: false, error: ended }, 409);
    }

    await deps.anonymiseProfile(userId);
    await deps.deleteAuthUser(userId);
    deps.log("account.deleted");
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("delete-account failed", error);
    return json({ ok: false, error: "internal error" }, 500);
  }
}
