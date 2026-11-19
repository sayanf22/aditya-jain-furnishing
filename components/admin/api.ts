// Browser client for /api/admin/*. Sends the session cookie (same origin) and
// the X-CSRF-Token header on every change. Errors always become ApiFailure
// with a plain-words message, so screens never handle raw responses.
import type { ApiError } from "@/lib/admin-api";

const BASE = "/api/admin";

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  readonly retryAfter?: number;

  constructor(status: number, code: string, message: string, field?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.retryAfter = retryAfter;
  }
}

let csrfToken = "";
let onSignedOut: (() => void) | null = null;

export function setCsrf(token: string) {
  csrfToken = token;
}
export function getCsrf() {
  return csrfToken;
}
/** Called when the server says the session ended (not for sign-in attempts). */
export function setSignedOutHandler(handler: (() => void) | null) {
  onSignedOut = handler;
}

function fallbackMessage(status: number): string {
  if (status === 0) return "Can't reach the server. Check your connection and try again.";
  if (status === 401) return "You are signed out. Sign in again.";
  if (status === 403) return "That was blocked. Reload the page and try again.";
  if (status === 413) return "That file is too large.";
  if (status === 429) return "Too many tries. Wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again.";
  return "That didn't work. Try again.";
}

export function failureFrom(status: number, text: string, retryAfter: string | null): ApiFailure {
  let code = "ERROR";
  let message = fallbackMessage(status);
  let field: string | undefined;
  try {
    const body = JSON.parse(text) as Partial<ApiError>;
    if (body.error?.message) {
      code = body.error.code ?? code;
      message = body.error.message;
      field = body.error.field;
    }
  } catch {
    // Not JSON: keep the plain fallback.
  }
  const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : NaN;
  return new ApiFailure(status, code, message, field, Number.isFinite(seconds) ? seconds : undefined);
}

export function asFailure(error: unknown): ApiFailure {
  return error instanceof ApiFailure ? error : new ApiFailure(0, "NETWORK", fallbackMessage(0));
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { method, headers, body: payload, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiFailure(0, "NETWORK", fallbackMessage(0));
  }
  const text = await response.text();
  if (!response.ok) {
    const failure = failureFrom(response.status, text, response.headers.get("Retry-After"));
    if (response.status === 401 && !path.startsWith("/auth/")) onSignedOut?.();
    throw failure;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const api = {
  get: <T>(path: string) => send<T>("GET", path),
  post: <T>(path: string, body?: unknown) => send<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => send<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => send<T>("PUT", path, body),
  del: <T>(path: string) => send<T>("DELETE", path),
};

/** Builds "?a=1&b=2", leaving out empty values. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
