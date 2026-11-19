"use client";

// Enquiries from the website form: unread first, mark read, call, delete.
import { useMemo, useState } from "react";
import type { Enquiry, Page } from "@/lib/admin-api";
import { api, asFailure } from "./api";
import { timeAgo } from "./format";
import { usePaged } from "./hooks";
import { IconCheck, IconPhone, IconTrash } from "./icons";
import { useSession } from "./session";
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, IconButton, Loading, PageHeader, Segmented, cx, useToast } from "./ui";

type Filter = "all" | "unread";
type EnquiryPage = Page<Enquiry> & { unread: number };

export function EnquiriesScreen() {
  const toast = useToast();
  const { unread, setUnread } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const list = usePaged<Enquiry, EnquiryPage>(`/enquiries?filter=${filter}&limit=50`);
  const [deleting, setDeleting] = useState<Enquiry | null>(null);
  const { mutate, reload } = list;

  const items = useMemo(
    () => [...list.items].sort((a, b) => Number(a.isRead) - Number(b.isRead) || b.createdAt.localeCompare(a.createdAt)),
    [list.items],
  );

  async function setRead(item: Enquiry, isRead: boolean) {
    mutate((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead } : entry)));
    setUnread(Math.max(0, unread + (isRead ? -1 : 1)));
    try {
      await api.patch(`/enquiries/${item.id}`, { isRead });
    } catch (error) {
      toast(asFailure(error).message, "error");
      reload();
    }
  }

  return (
    <>
      <PageHeader title="Enquiries" />
      <Segmented
        label="Filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread", count: unread },
        ]}
      />

      <div className="a-tabpanel">
        {list.error && items.length === 0 ? (
          <ErrorNote error={list.error} onRetry={reload} />
        ) : list.loading && items.length === 0 ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty title={filter === "unread" ? "All caught up" : "No enquiries yet"}>
            {filter === "unread" ? "Nothing unread." : "They appear here when someone fills in the form on the site."}
          </Empty>
        ) : (
          <ul className="a-enquiries">
            {items.map((item) => (
              <li key={item.id} className={cx("a-enquiry", !item.isRead && "is-unread")}>
                <header className="a-enquiry__head">
                  <div>
                    <h2 className="a-enquiry__name">
                      {!item.isRead && <span className="a-dot" aria-label="Unread" />}
                      {item.name}
                    </h2>
                    <p className="a-enquiry__meta">
                      {item.company ? `${item.company} · ` : ""}
                      {timeAgo(item.createdAt)}
                    </p>
                  </div>
                  <Badge tone={item.customerType === "B2B" ? "amber" : "neutral"}>{item.customerType === "B2B" ? "Business" : "Home"}</Badge>
                </header>
                {(item.productName || item.categoryName) && <p className="a-enquiry__about">{[item.categoryName, item.productName].filter(Boolean).join(" › ")}</p>}
                {item.message && <p className="a-enquiry__message">{item.message}</p>}
                <footer className="a-enquiry__actions">
                  <a className="a-btn a-btn--primary" href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}>
                    <IconPhone />
                    {item.phone}
                  </a>
                  <Button icon={<IconCheck />} onClick={() => void setRead(item, !item.isRead)}>
                    {item.isRead ? "Mark unread" : "Mark read"}
                  </Button>
                  <IconButton label={`Delete enquiry from ${item.name}`} onClick={() => setDeleting(item)}>
                    <IconTrash />
                  </IconButton>
                </footer>
              </li>
            ))}
          </ul>
        )}
        {list.hasMore && (
          <div className="a-more-row">
            <Button onClick={() => void list.loadMore()} busy={list.loadingMore}>
              Show more
            </Button>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete the enquiry from ${deleting.name}?`}
          actionLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.del(`/enquiries/${deleting.id}`);
            mutate((current) => current.filter((entry) => entry.id !== deleting.id));
            if (!deleting.isRead) setUnread(Math.max(0, unread - 1));
            toast("Enquiry deleted");
          }}
        >
          <p>It can’t be brought back.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
