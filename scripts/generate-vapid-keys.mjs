#!/usr/bin/env node
// One-time VAPID key generation for web push (Phase 10). Prints:
//   VITE_VAPID_PUBLIC_KEY — base64url raw P-256 point; goes in .env and the
//                           GitHub Actions build secrets (client bundle)
//   VAPID_KEYS            — the JWK pair; goes to the push-send edge function
//                           via `npx supabase secrets set VAPID_KEYS='...'`
// Both halves come from the same keypair — regenerate them together or
// existing subscriptions stop validating.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

const raw = Buffer.concat([
  Buffer.from([4]), // uncompressed-point marker
  Buffer.from(pub.x, "base64url"),
  Buffer.from(pub.y, "base64url"),
]);

console.log(`VITE_VAPID_PUBLIC_KEY=${raw.toString("base64url")}`);
console.log(`VAPID_KEYS=${JSON.stringify({ publicKey: pub, privateKey: priv })}`);
