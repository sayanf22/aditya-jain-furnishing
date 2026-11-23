"use client";

// Overview: is the site up to date, what needs attention, and where to go next.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminCategory, PublishStatus } from "@/lib/admin-api";
import { api, asFailure } from "./api";
import { countTypes } from "./catalogue-utils";
import { plural, timeAgo } from "./format";
import { useResource } from "./hooks";
import { IconCollections, IconDesigns, IconEnquiries, IconPhotos, IconPublish, IconSite } from "./icons";
import { useSession } from "./session";
import { Button, ErrorNote, PageHeader, cx, useToast } from "./ui";

type Catalogue = { categories: AdminCategory[]; totalProducts: number };

export function OverviewScreen() {
  const { me, unread } = useSession();
  const catalogue = useResource<Catalogue>("/catalogue");
  const categories = catalogue.data?.categories ?? [];
  const types = categories.reduce((total, category) => total + countTypes(category.children), 0);
  const greeting = me.user.name ? `Hello, ${me.user.name.split(" ")[0]}` : "Overview";

  return (
    <>
      <PageHeader title={greeting} />
      <div className="a-stack a-stack--lg">
        <PublishCard />

        {catalogue.error && !catalogue.data && <ErrorNote error={catalogue.error} onRetry={catalogue.reload} />}

        <ul className="a-stats">
          <Stat href="/admin/enquiries" icon={<IconEnquiries />} value={unread} label="Unread enquiries" alert={unread > 0} />
          <Stat href="/admin/collections" icon={<IconCollections />} value={catalogue.data ? categories.length : null} label="Collections" />
          <Stat href="/admin/collections" icon={<IconCollections />} value={catalogue.data ? types : null} label="Types" />
          <Stat href="/admin/designs" icon={<IconDesigns />} value={catalogue.data?.totalProducts ?? null} label="Designs" />
        </ul>

        <nav className="a-shortcuts" aria-label="Shortcuts">
          <Link href="/admin/designs" className="a-shortcut">
            <IconDesigns />
            Add a design
          </Link>
          <Link href="/admin/photos" className="a-shortcut">
            <IconPhotos />
            Upload photos
          </Link>
          <Link href="/admin/site" className="a-shortcut">
            <IconSite />
            Site photos
          </Link>
        </nav>
      </div>
    </>
  );
}

function Stat({ href, icon, value, label, alert }: { href: string; icon: ReactNode; value: number | null; label: string; alert?: boolean }) {
  return (
    <li>
      <Link href={href} className={cx("a-stat", alert && "is-alert")}>
        {icon}
        <span className="a-stat__value">{value ?? "–"}</span>
        <span className="a-stat__label">{label}</span>
      </Link>
    </li>
  );
}

const POLL_MS = 8000;

function PublishCard() {
  const toast = useToast();
  const status = useResource<PublishStatus>("/publish");
  const [busy, setBusy] = useState(false);
  const { data, mutate, reload } = status;
  const building = data?.state === "building";

  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [building, reload]);

  async function publish() {
    setBusy(true);
    try {
      const next = await api.post<PublishStatus>("/publish");
      mutate(() => next);
      toast("Publishing started");
    } catch (error) {
      toast(asFailure(error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (status.error && !data) return <ErrorNote error={status.error} onRetry={reload} />;

  const state = data?.state;
  const title = !data ? "Checking…" : state === "current" ? "Site is up to date" : state === "building" ? "Publishing…" : `${plural(data.changesWaiting, "change")} waiting`;
  const note = !data
    ? ""
    : state === "current"
      ? "Visitors see everything you’ve saved."
      : state === "building"
        ? `Started ${data.requestedAt ? timeAgo(data.requestedAt).toLowerCase() : "just now"}. Takes a few minutes.`
        : "Saved. It goes live by itself a few minutes after you stop editing, or press Publish to send it now.";

  const offline = data?.configured === false;

  return (
    <section className={cx("a-publish", state && `is-${state}`)} aria-label="Publish">
      <span className="a-publish__dot" aria-hidden="true" />
      <div className="a-publish__text">
        <h2 className="a-publish__title">{title}</h2>
        <p className="a-publish__note">{offline ? "Publishing isn’t connected on this copy." : note}</p>
      </div>
      <Button variant="accent" icon={<IconPublish />} onClick={publish} busy={busy || building} disabled={state !== "changes" || offline}>
        {building ? "Publishing" : "Publish"}
      </Button>
    </section>
  );
}
