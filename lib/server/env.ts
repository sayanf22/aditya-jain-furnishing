// Bindings and secrets the dashboard API uses. Declared here (not taken from
// the generated cloudflare-env.d.ts) because secrets are only in that file
// when .dev.vars exists at type-generation time.
export type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type AdminEnv = {
  DB: D1Database;
  AUTH_DB: D1Database;
  ENQ_DB: D1Database;
  AUDIT_DB: D1Database;
  MEDIA: R2Bucket;
  ENQUIRY_LIMITER?: Limiter;
  LOGIN_LIMITER?: Limiter;
  ADMIN_LIMITER?: Limiter;
  SESSION_PEPPER?: string;
  SETUP_CODE?: string;
  EXPORT_TOKEN?: string;
  DEPLOY_HOOK_URL?: string;
  /** Resend API key (Worker secret). Without it, email codes are off and password sign-in is unaffected. */
  RESEND_API_KEY?: string;
  /** Sender, e.g. "Delta Furnishings <onboarding@resend.dev>". A verified domain is needed to send from your own address. */
  RESEND_FROM?: string;
  /** The only email address that may own the dashboard (Worker secret). Unset: any address may run the first-time setup. */
  ADMIN_EMAIL?: string;
  /** Local development only (see lib/server/email.ts). */
  NEXTJS_ENV?: string;
  DEV_EMAIL_STUB?: string;
};
