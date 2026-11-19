// Small HTTP helpers for the dashboard API: JSON replies, one error type,
// and strict input checking (bodies are validated against a field list;
// unknown fields are refused).
import type { ApiError } from "../admin-api";

export class ApiFail extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly extra?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const fail = (status: number, code: string, message: string, field?: string, extra?: Record<string, unknown>, headers?: Record<string, string>) =>
  new ApiFail(status, code, message, field, extra, headers);

/** Headers on every dashboard API reply. */
export const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(API_HEADERS);
  if (extra) new Headers(extra).forEach((value, key) => headers.append(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(e: ApiFail): Response {
  const error: ApiError["error"] & Record<string, unknown> = { code: e.code, message: e.message, ...e.extra };
  if (e.field) error.field = e.field;
  return json({ error }, e.status, e.headers);
}

// ------------------------------------------------------------ body reading

const MAX_JSON_BYTES = 32 * 1024;

/** Reads a request body into memory, stopping when it passes `max` bytes. */
export async function readBytes(request: Request, max: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > max) throw fail(413, "TOO_LARGE", "That request is too large.");
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw fail(413, "TOO_LARGE", "That request is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
    throw fail(415, "BAD_CONTENT_TYPE", "Expected JSON.");
  }
  const bytes = await readBytes(request, MAX_JSON_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw fail(400, "BAD_JSON", "That request could not be read.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw fail(400, "BAD_JSON", "That request could not be read.");
  return value as Record<string, unknown>;
}

// -------------------------------------------------------------- validation

export type Rule<T> = (value: unknown, field: string) => T;

// Control characters except tab, newline and carriage return.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Text, trimmed. `min` 0 allows an empty string (kept as ""). */
export const text =
  (max: number, min = 0): Rule<string> =>
  (value, field) => {
    if (typeof value !== "string") throw fail(400, "INVALID", "This needs to be text.", field);
    const v = value.trim();
    if (v.length < min) throw fail(400, "INVALID", min === 1 ? "This is needed." : `Use at least ${min} characters.`, field);
    if (v.length > max) throw fail(400, "INVALID", `Keep this under ${max} characters.`, field);
    if (CONTROL.test(v)) throw fail(400, "INVALID", "This has characters that are not allowed.", field);
    return v;
  };

/** Text or null; an empty string becomes null. */
export const optText =
  (max: number): Rule<string | null> =>
  (value, field) => {
    if (value === null) return null;
    const v = text(max)(value, field);
    return v === "" ? null : v;
  };

export const bool: Rule<boolean> = (value, field) => {
  if (typeof value !== "boolean") throw fail(400, "INVALID", "This needs to be true or false.", field);
  return value;
};

export const int =
  (min: number, max: number): Rule<number> =>
  (value, field) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw fail(400, "INVALID", "This number is not valid.", field);
    return value;
  };

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slug: Rule<string> = (value, field) => {
  const v = text(60, 1)(value, field);
  if (!SLUG.test(v)) throw fail(400, "INVALID", "Use lowercase letters, numbers and single dashes.", field);
  return v;
};

export const nullable =
  <T>(rule: Rule<T>): Rule<T | null> =>
  (value, field) =>
    value === null ? null : rule(value, field);

/** A row id sent in a JSON body. */
export const idField: Rule<number> = int(1, 2 ** 31);

export const idList =
  (max = 500): Rule<number[]> =>
  (value, field) => {
    if (!Array.isArray(value) || value.length > max) throw fail(400, "INVALID", "This list is not valid.", field);
    const ids = value.map((v) => int(1, 2 ** 31)(v, field));
    if (new Set(ids).size !== ids.length) throw fail(400, "INVALID", "This list has repeats.", field);
    return ids;
  };

type Spec = Record<string, Rule<unknown>>;
type Parsed<S extends Spec> = { [K in keyof S]?: ReturnType<S[K]> };

/**
 * Checks a JSON body against `spec`. Unknown fields are refused; fields
 * listed in `required` must be present. Absent optional fields are left out.
 */
export function parse<S extends Spec>(body: Record<string, unknown>, spec: S, required: (keyof S & string)[] = []): Parsed<S> {
  for (const key of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) throw fail(400, "UNKNOWN_FIELD", "That request has a field that is not allowed.", key);
  }
  for (const key of required) {
    if (body[key] === undefined) throw fail(400, "INVALID", "This is needed.", key);
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(spec)) {
    if (body[key] !== undefined) out[key] = spec[key](body[key], key);
  }
  return out as Parsed<S>;
}

/** Numeric id from a path segment. */
export function idParam(raw: string): number {
  const n = Number(raw);
  if (!/^\d{1,10}$/.test(raw) || n < 1) throw fail(404, "NOT_FOUND", "That was not found.");
  return n;
}

// -------------------------------------------------------------- pagination

export function pageLimit(url: URL, fallback = 50): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw fail(400, "INVALID", "The limit is not valid.", "limit");
  return Math.min(n, 200);
}

export const encodeCursor = (parts: (string | number)[]) => btoa(parts.join(":")).replace(/=+$/, "");
/** Reads a page marker made by encodeCursor with `count` numbers, or null for the first page. */
export function decodeCursor(raw: string | null, count: number): number[] | null {
  if (!raw) return null;
  try {
    const parts = atob(raw).split(":");
    if (parts.length !== count) throw 0;
    return parts.map((p) => {
      if (!/^-?\d{1,15}$/.test(p)) throw 0;
      return Number(p);
    });
  } catch {
    throw fail(400, "INVALID", "The page marker is not valid.", "cursor");
  }
}

// ------------------------------------------------------------------ dates

/** D1's datetime('now') text ("2026-11-20 10:00:00", UTC) as an ISO string. */
export const iso = (s: string): string => (s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
