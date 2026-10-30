import { generateKeyPairSync } from "node:crypto";

export interface VapidKeys {
  /** The uncompressed P-256 point, base64url. Safe to publish: browsers need it to subscribe. */
  publicKey: string;
  /** The 32-byte private scalar, base64url. A secret: Supabase secrets only. */
  privateKey: string;
}

/** A fresh VAPID key pair in the format browsers and push libraries expect. */
export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  if (!jwk.x || !jwk.y || !jwk.d) throw new Error("Could not export the generated key.");

  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  return { publicKey: point.toString("base64url"), privateKey: jwk.d };
}
