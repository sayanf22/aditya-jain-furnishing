// Authenticator-app codes (RFC 6238 TOTP over RFC 4226 HOTP): SHA-1, 6 digits, 30 s.
import { randomBytes } from "./crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.toUpperCase().replace(/=+$/, "")) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("bad base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** A new 160-bit secret, base32 (what authenticator apps expect). */
export const newTotpSecret = (): string => base32Encode(randomBytes(20));

export const totpStep = (nowMs = Date.now()): number => Math.floor(nowMs / 30_000);

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, counter >>> 0);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = mac[mac.length - 1] & 15;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * Checks a 6-digit code for steps now-1, now, now+1. Returns the matching
 * step, or null. A step at or before `lastStep` is refused (a code works once).
 */
export async function verifyTotp(secretBase32: string, code: string, lastStep: number | null, nowMs = Date.now()): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = totpStep(nowMs);
  let found: number | null = null;
  // Every candidate is computed so timing does not show which step matched.
  for (const step of [now - 1, now, now + 1]) {
    const expected = await hotp(secret, step);
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0 && (lastStep === null || step > lastStep)) found = step;
  }
  return found;
}

export function otpauthUri(secret: string, email: string, issuer = "Delta Furnishings"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
