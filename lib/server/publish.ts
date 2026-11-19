// Publish: compares the content version in the database with the version the
// running site was built from, and asks Workers Builds (deploy hook) to
// rebuild the site. Nothing public changes until that build finishes.
import type { PublishStatus } from "../admin-api";
import buildInfo from "../build-info.json";
import { audit } from "./audit";
import type { Ctx } from "./context";
import { fail } from "./http";

const BUILDING_WINDOW_MS = 15 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

type StateRow = { version: number; requested_version: number | null; requested_at: string | null };

function hookUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    return u.protocol === "https:" || (u.protocol === "http:" && local) ? u : null;
  } catch {
    return null;
  }
}

function statusFrom(row: StateRow, configured: boolean, nowMs = Date.now()): PublishStatus {
  const liveVersion = Number(buildInfo.contentVersion) || 0;
  const waiting = Math.max(0, row.version - liveVersion);
  const requestedAt = row.requested_at;
  const recent = requestedAt !== null && nowMs - Date.parse(requestedAt) < BUILDING_WINDOW_MS;
  const state: PublishStatus["state"] = waiting === 0 ? "current" : recent && (row.requested_version ?? 0) >= row.version ? "building" : "changes";
  return { state, version: row.version, liveVersion, changesWaiting: waiting, requestedAt, configured };
}

async function readState(c: Ctx): Promise<StateRow> {
  const row = await c.env.DB.prepare("SELECT version, requested_version, requested_at FROM content_state WHERE id = 1").first<StateRow>();
  if (!row) throw fail(500, "NO_STATE", "The content state is missing.");
  return row;
}

export async function getPublishStatus(c: Ctx): Promise<PublishStatus> {
  return statusFrom(await readState(c), hookUrl(c.env.DEPLOY_HOOK_URL) !== null);
}

export async function requestPublish(c: Ctx): Promise<PublishStatus> {
  const hook = hookUrl(c.env.DEPLOY_HOOK_URL);
  if (!hook) throw fail(503, "PUBLISH_NOT_CONFIGURED", "Publishing is not set up on this site yet.");
  const before = await readState(c);
  if (statusFrom(before, true).state === "current") throw fail(409, "NOTHING_TO_PUBLISH", "The live site already shows everything.");

  // Claim the slot first: one request a minute, even if two arrive together.
  const t = Date.now();
  const claim = await c.env.DB
    .prepare("UPDATE content_state SET requested_version = version, requested_at = ?1 WHERE id = 1 AND (requested_at IS NULL OR requested_at < ?2)")
    .bind(new Date(t).toISOString(), new Date(t - MIN_GAP_MS).toISOString())
    .run();
  if (!claim.meta.changes) throw fail(429, "TOO_SOON", "A publish was just requested. Wait a minute.", undefined, undefined, { "Retry-After": "60" });

  let ok = false;
  try {
    const res = await fetch(hook, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000) });
    ok = res.ok;
    await res.body?.cancel();
  } catch {
    ok = false;
  }
  if (!ok) {
    // Give the slot back so the owner can try again straight away.
    await c.env.DB.prepare("UPDATE content_state SET requested_version = ?1, requested_at = ?2 WHERE id = 1").bind(before.requested_version, before.requested_at).run();
    audit(c, "publish_failed", "site");
    throw fail(502, "PUBLISH_FAILED", "The publish request did not go through. Try again in a moment.");
  }
  audit(c, "publish", "site", undefined, { version: before.version });
  return statusFrom(await readState(c), true);
}
