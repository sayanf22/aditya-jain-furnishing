import type { AdminEnv } from "./env";

export type Session = {
  id: string; // hex SHA-256 of the cookie token
  userId: number;
  email: string;
  name: string | null;
  totpEnabled: boolean;
  csrf: string;
  createdAt: number; // unix seconds
  idleExpiresAt: number;
  expiresAt: number;
};

/** What a handler receives. */
export type Ctx = {
  request: Request;
  env: AdminEnv;
  exec: ExecutionContext;
  url: URL;
  /** Captured path pieces, in order (":id" segments). */
  params: string[];
  ip: string;
  pepper: string;
  /** Null on the few public routes. */
  session: Session | null;
};

/** For handlers behind the session check. */
export function me(c: Ctx): Session {
  if (!c.session) throw new Error("session missing");
  return c.session;
}
