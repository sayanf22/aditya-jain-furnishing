// Emailed sign-in code (forgot password). Routes under /api/admin, all public
// except the last, which needs the short session the verify step starts.
// The Backend owner has not published these in lib/admin-api.ts yet; the paths
// and shapes are kept here, in one place, so they are easy to match.
//
//   GET  /auth/status            -> AuthStatus & { emailCodes?: boolean }
//   POST /auth/code/request      { email }                -> Ok (same answer whether or not the email is the owner's)
//   POST /auth/code/verify       { email, code, totp? }   -> { ok: true } | { needsCode: true } (needsCode: authenticator code still required)
//   POST /auth/code/password     { next }                 -> MeResponse (new password set, fully signed in)
import type { AuthStatus } from "@/lib/admin-api";

export type AuthStatusWithEmail = AuthStatus & { emailCodes?: boolean };
export type CodeVerifyResponse = { ok: true } | { needsCode: true };

/** True only when the server says emailed codes are set up. */
export function emailCodesAvailable(status: AuthStatusWithEmail | null): boolean {
  return status?.emailCodes === true;
}
