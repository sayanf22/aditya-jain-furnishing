// The people who can sign in to the dashboard.
//   GET    /api/admin/users          -> { items: TeamMember[] }
//   POST   /api/admin/users          { email, name? } -> { member, invited }
//   DELETE /api/admin/users/:id      -> Ok
// A new person is added with a password nobody knows (random, never shown). They open the
// sign-in page, choose "Forgot password or first time?", enter their email, type the 6-digit
// code that is emailed to them, and choose their own password: the same flow as a forgotten
// password (./recovery.ts). So no password is ever sent or shared.
import type { Ok, TeamMember } from "../admin-api";
import { audit } from "./audit";
import { email } from "./auth";
import type { Ctx } from "./context";
import { PBKDF2_ITERATIONS, b64u, randomBytes } from "./crypto";
import { inviteEmail, emailAvailable, sendEmail } from "./email";
import { fail, idList, idParam, json, parse, readJson, text } from "./http";

const MAX_PEOPLE = 10;

type Row = { id: number; email: string; display_name: string | null; created_at: string; last_login_at: string | null; password_changed_at: string | null; notify_enquiries: number };
const COLS = "id, email, display_name, created_at, last_login_at, password_changed_at, notify_enquiries";

function toMember(row: Row, selfId: number): TeamMember {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    createdAt: row.created_at.replace(" ", "T") + "Z",
    lastSignIn: row.last_login_at ? row.last_login_at.replace(" ", "T") + "Z" : null,
    // Added but nobody has signed in or chosen a password yet.
    waiting: row.password_changed_at === null && row.last_login_at === null,
    you: row.id === selfId,
    notifyEnquiries: row.notify_enquiries === 1,
  };
}

export async function listUsers(c: Ctx): Promise<{ items: TeamMember[] }> {
  const { results } = await c.env.AUTH_DB.prepare(`SELECT ${COLS} FROM admin_users WHERE disabled = 0 ORDER BY id`).all<Row>();
  return { items: results.map((r) => toMember(r, c.session!.userId)) };
}

/** Replaces the list of people who get an email about each new enquiry. Only people who can sign in; the list may be empty. */
export async function setEnquiryEmails(c: Ctx): Promise<{ items: TeamMember[] }> {
  const body = parse(await readJson(c.request), { ids: idList(MAX_PEOPLE) }, ["ids"]);
  const ids = [...new Set(body.ids)];
  await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("UPDATE admin_users SET notify_enquiries = 0 WHERE disabled = 0"),
    ...ids.map((id) => c.env.AUTH_DB.prepare("UPDATE admin_users SET notify_enquiries = 1 WHERE id = ?1 AND disabled = 0").bind(id)),
  ]);
  const out = await listUsers(c);
  audit(c, "enquiry-emails.set", "user", undefined, { emails: out.items.filter((m) => m.notifyEnquiries).map((m) => m.email).join(", ").slice(0, 300) });
  return out;
}

export async function addUser(c: Ctx): Promise<Response> {
  const body = parse(await readJson(c.request), { email, name: text(80) }, ["email"]);
  const count = await c.env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE disabled = 0").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PEOPLE) throw fail(409, "LIMIT", `Up to ${MAX_PEOPLE} people can sign in.`);
  // A password that nobody knows: random salt and a random hash, so no password can match it.
  const res = await c.env.AUTH_DB
    .prepare("INSERT INTO admin_users (email, display_name, pw_salt, pw_hash, pw_iterations) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (email) DO NOTHING")
    .bind(body.email, body.name || null, b64u(randomBytes(16)), b64u(randomBytes(32)), PBKDF2_ITERATIONS)
    .run();
  if (!res.meta.changes) throw fail(409, "EXISTS", "That email can already sign in.", "email");
  const row = await c.env.AUTH_DB.prepare(`SELECT ${COLS} FROM admin_users WHERE email = ?1`).bind(body.email).first<Row>();
  audit(c, "user.add", "user", row!.id, { email: body.email });
  // Tell them how to start. If email is off or refused, the owner is told, and can pass the news on.
  let invited = false;
  if (emailAvailable(c.env)) {
    invited = await sendEmail(c.env, { to: row!.email, ...inviteEmail(new URL(c.request.url).origin, c.session!.name ?? c.session!.email), idempotencyKey: `invite-${row!.id}` });
  }
  return json({ member: toMember(row!, c.session!.userId), invited }, 201);
}

export async function removeUser(c: Ctx): Promise<Ok> {
  const id = idParam(c.params[0]);
  if (id === c.session!.userId) throw fail(400, "SELF", "You can't remove yourself. Ask another person to do it.");
  const row = await c.env.AUTH_DB.prepare("SELECT email FROM admin_users WHERE id = ?1 AND disabled = 0").bind(id).first<{ email: string }>();
  if (!row) throw fail(404, "NOT_FOUND", "That person was not found.");
  // Their devices are signed out and their pending codes are removed with them.
  await c.env.AUTH_DB.batch([
    c.env.AUTH_DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
    c.env.AUTH_DB.prepare("DELETE FROM email_codes WHERE user_id = ?1").bind(id),
    c.env.AUTH_DB.prepare("DELETE FROM admin_users WHERE id = ?1").bind(id),
  ]);
  audit(c, "user.remove", "user", id, { email: row.email });
  return { ok: true };
}
