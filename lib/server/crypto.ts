// Web Crypto helpers: tokens, hashing, password hashing, secret encryption.
// Everything uses the platform's native crypto, so CPU use stays small.
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Password rounds. Workers allows at most 100,000; 20,000 fits the Free plan's 10 ms CPU limit. */
export const PBKDF2_ITERATIONS = 20_000;

export function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(text: string): Uint8Array {
  const s = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = (n = 32): string => b64u(randomBytes(n));

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : (data as BufferSource)));
}

async function hmacKey(secret: string | Uint8Array, usage: "sign"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", typeof secret === "string" ? enc.encode(secret) : (secret as BufferSource), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(data)));
}

/** True when a configured secret is long enough and is not a copied placeholder from .dev.vars.example. */
export function secretOk(value: string | undefined, min: number): value is string {
  return typeof value === "string" && value.length >= min && !/change-me/i.test(value);
}

/** Compares two strings without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Short stable id of a value (an IP address or email) that can't be reversed without the pepper. */
export async function pseudonym(pepper: string, kind: string, value: string): Promise<string> {
  return hex(await hmacSha256(pepper, `${kind}:${value}`)).slice(0, 32);
}

// ---------------------------------------------------------------- passwords

/** PBKDF2-SHA256 over HMAC-SHA256(pepper, password), so the stored hash is useless without the pepper. */
export async function hashPassword(pepper: string, password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const prehash = await hmacSha256(pepper, password);
  const key = await crypto.subtle.importKey("raw", prehash as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return b64u(new Uint8Array(bits));
}

// ------------------------------------------------------ secret encryption

async function aesKey(pepper: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`delta-totp-key:${pepper}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-GCM; the result is base64url of iv (12 bytes) + ciphertext. */
export async function encryptSecret(pepper: string, plain: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await aesKey(pepper), enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64u(out);
}

export async function decryptSecret(pepper: string, stored: string): Promise<string> {
  const all = fromB64u(stored);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) as BufferSource }, await aesKey(pepper), all.slice(12));
  return dec.decode(plain);
}
