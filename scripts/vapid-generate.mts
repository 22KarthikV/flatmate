import { generateVapidKeys } from "./vapid-keys.mts";

// Prints a new VAPID key pair. It writes nothing to disk and the private key is never logged
// anywhere else: copy it straight into the secret store, then close the terminal.
const { publicKey, privateKey } = generateVapidKeys();

console.log(`
VAPID keys (generated just now; run again for a different pair)

Public key (not secret). Vercel env and .env.local:
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}

Private key (SECRET). Supabase secrets only, never the repo, never a NEXT_PUBLIC_ variable:
  supabase secrets set VAPID_PRIVATE_KEY=${privateKey} VAPID_PUBLIC_KEY=${publicKey} VAPID_SUBJECT=mailto:<your address> --project-ref <project-ref>

Rotating these invalidates every existing push subscription; devices re-subscribe on next open.
`);
