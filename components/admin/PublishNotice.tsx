"use client";

// A slim bar above every dashboard page while saved changes are not on the website yet. The site is
// pre-built, so a change shows to visitors after a rebuild: it starts by itself a few minutes after
// editing stops, or at once with "Publish now".
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublishStatus } from "@/lib/admin-api";
import { api, asFailure } from "./api";
import { plural } from "./format";
import { cx, useToast } from "./ui";

export function PublishNotice() {
  const pathname = usePathname();
  const toast = useToast();
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [busy, setBusy] = useState(false);

  // Look at the status on every page change, and again every few seconds while changes wait or a build runs.
  const [tick, setTick] = useState(0);
  const waiting = status !== null && status.state !== "current";
  const building = status?.state === "building";
  useEffect(() => {
    let live = true;
    api.get<PublishStatus>("/publish").then(
      (next) => live && setStatus(next),
      () => undefined, // the bar is a convenience; the Overview page shows errors
    );
    return () => {
      live = false;
    };
  }, [pathname, tick]);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), building ? 8000 : 20000);
    return () => window.clearInterval(timer);
  }, [waiting, building]);

  if (!status || status.state === "current" || pathname === "/admin") return null;

  async function publishNow() {
    setBusy(true);
    try {
      setStatus(await api.post<PublishStatus>("/publish"));
      toast("Publishing started");
    } catch (error) {
      toast(asFailure(error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx("a-pubnote", building && "is-building")} role="status">
      <span className="a-pubnote__dot" aria-hidden="true" />
      <span className="a-pubnote__text">
        {building
          ? "Publishing. Your changes reach the website in a few minutes."
          : `${plural(status.changesWaiting, "change")} saved. They go live on the website by themselves a few minutes after you stop editing.`}
      </span>
      {!building && status.configured && (
        <button type="button" className="a-pubnote__btn" onClick={() => void publishNow()} disabled={busy}>
          Publish now
        </button>
      )}
    </div>
  );
}
