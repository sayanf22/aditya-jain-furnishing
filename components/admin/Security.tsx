"use client";

// Security: who can sign in, password, authenticator app, signed-in devices, recent activity.
import { useState, type FormEvent, type ReactNode } from "react";
import type { AuditEntry, NewMember, NewMemberResponse, SessionInfo, TeamMember, TwoFactorStart } from "@/lib/admin-api";
import { ApiFailure, api, asFailure } from "./api";
import { PasswordHint } from "./AuthForms";
import { dateTime, timeAgo } from "./format";
import { usePaged, useResource } from "./hooks";
import { IconCopy, IconDevice, IconExternal, IconPlus, IconTrash } from "./icons";
import { useSession } from "./session";
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, Field, IconButton, Loading, PageHeader, PasswordInput, SaveActions, Switch, TextInput, useToast } from "./ui";

type PeopleResource = ReturnType<typeof useResource<{ items: TeamMember[] }>>;

export function SecurityScreen() {
  const people = useResource<{ items: TeamMember[] }>("/users");
  return (
    <>
      <PageHeader title="Security" />
      <div className="a-stack a-stack--lg">
        <PeopleCard people={people} />
        <EnquiryEmailsCard people={people} />
        <PasswordCard />
        <TwoFactorCard />
        <DevicesCard />
        <ActivityCard />
      </div>
    </>
  );
}

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="a-card a-card--pad" aria-label={title}>
      <div className="a-card__head">
        <h2 className="a-card__title">{title}</h2>
        {note}
      </div>
      {children}
    </section>
  );
}

/** Who can sign in. A new person chooses their own password with an emailed code, so none is ever shared. */
function PeopleCard({ people }: { people: PeopleResource }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const form = useFieldFailure();
  const items = people.data?.items ?? [];

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    form.clear();
    try {
      const body: NewMember = { email: email.trim(), ...(name.trim() ? { name: name.trim() } : {}) };
      const made = await api.post<NewMemberResponse>("/users", body);
      toast(made.invited ? "Added. We emailed them how to start." : "Added. Ask them to use “Forgot password or first time?” on the sign-in page.");
      setEmail("");
      setName("");
      people.reload();
    } catch (error) {
      form.set(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="People" note={<Badge tone="neutral">{items.length || ""}</Badge>}>
      <p className="a-card__text">Everyone here can sign in to the dashboard. Choose who is emailed about new enquiries in “Enquiry emails” below.</p>
      {people.error && !people.data ? (
        <ErrorNote error={people.error} onRetry={people.reload} />
      ) : !people.data ? (
        <Loading />
      ) : (
        <ul className="a-devices a-people">
          {items.map((person) => (
            <li key={person.id} className="a-device">
              <span className="a-person__initial" aria-hidden="true">
                {(person.name || person.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="a-device__text">
                <span className="a-device__name">
                  {person.name || person.email} {person.you && <Badge tone="green">You</Badge>} {person.waiting && <Badge tone="amber">Hasn’t signed in yet</Badge>}
                </span>
                <span className="a-device__meta">
                  {person.name ? `${person.email} · ` : ""}
                  {person.lastSignIn ? `Last sign-in ${timeAgo(person.lastSignIn).toLowerCase()}` : "Not signed in yet"}
                </span>
              </span>
              {!person.you && (
                <IconButton label={`Remove ${person.email}`} onClick={() => setRemoving(person)}>
                  <IconTrash />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="a-form a-people__add" onSubmit={add} noValidate>
        <Field label="Add a person" error={form.field("email")} hint="They open the sign-in page, choose “Forgot password or first time?”, and set their own password.">
          <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="off" required />
        </Field>
        <Field label="Name (optional)" error={form.field("name")}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" />
        </Field>
        {form.general && (
          <p className="a-form__error" role="alert">
            {form.general}
          </p>
        )}
        <div className="a-actions">
          <Button type="submit" variant="primary" busy={busy} icon={<IconPlus />}>
            Add
          </Button>
        </div>
      </form>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name || removing.email}?`}
          actionLabel="Remove"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.del(`/users/${removing.id}`);
            toast("Removed. Their devices are signed out.");
            people.reload();
          }}
        >
          <p>They can no longer sign in, and are taken off the enquiry emails.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

/** Who gets an email about each new website enquiry. Changes wait for Save. The visitor is never emailed. */
function EnquiryEmailsCard({ people }: { people: PeopleResource }) {
  const toast = useToast();
  const items = people.data?.items ?? [];
  const saved = items.filter((p) => p.notifyEnquiries).map((p) => p.id);
  const [picked, setPicked] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = picked ?? saved;
  const dirty = picked !== null && [...picked].sort().join(",") !== [...saved].sort().join(",");

  function toggle(id: number, on: boolean) {
    setError(null);
    setPicked(on ? [...new Set([...current, id])] : current.filter((x) => x !== id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const out = await api.put<{ items: TeamMember[] }>("/users/enquiry-emails", { ids: current });
      people.mutate(() => out);
      setPicked(null);
      toast(current.length ? "Saved. Only these people get the enquiry emails." : "Saved. No one will get enquiry emails; enquiries still appear in the Enquiries page.");
    } catch (e) {
      setError(asFailure(e).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Enquiry emails" note={<Badge tone={saved.length ? "green" : "amber"}>{saved.length ? `${saved.length} on` : "none on"}</Badge>}>
      <p className="a-card__text">
        Turn on the people who should get an email each time someone sends the enquiry form. Customers are never emailed: they see a confirmation on the website. Every enquiry also shows in
        the Enquiries page.
      </p>
      {people.error && !people.data ? (
        <ErrorNote error={people.error} onRetry={people.reload} />
      ) : !people.data ? (
        <Loading />
      ) : (
        <ul className="a-devices a-people">
          {items.map((person) => (
            <li key={person.id} className="a-device">
              <span className="a-person__initial" aria-hidden="true">
                {(person.name || person.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="a-device__text">
                <span className="a-device__name">{person.name || person.email}</span>
                <span className="a-device__meta">{person.name ? person.email : person.you ? "You" : ""}</span>
              </span>
              <Switch label={`Email ${person.email} about new enquiries`} checked={current.includes(person.id)} onChange={(on) => toggle(person.id, on)} disabled={saving} />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="a-form__error" role="alert">
          {error}
        </p>
      )}
      <SaveActions dirty={dirty} saving={saving} onSave={save} onCancel={() => setPicked(null)} />
    </Card>
  );
}

function useFieldFailure() {
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  return {
    set: (error: unknown) => setFailure(asFailure(error)),
    clear: () => setFailure(null),
    field: (name: string) => (failure?.field === name ? failure.message : null),
    general: failure && !failure.field ? failure.message : null,
  };
}

function PasswordCard() {
  const toast = useToast();
  const { me, refreshMe } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const form = useFieldFailure();

  async function submit(event: FormEvent) {
    event.preventDefault();
    form.clear();
    if (next !== again) return setMismatch(true);
    setMismatch(false);
    setBusy(true);
    try {
      await api.post("/auth/password", { current, next });
      await refreshMe(); // the server issued a new session and CSRF token
      setCurrent("");
      setNext("");
      setAgain("");
      toast("Password changed. Other devices are signed out.");
    } catch (error) {
      form.set(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Password">
      <form className="a-form" onSubmit={submit} noValidate>
        <Field label="Current password" error={form.field("current")}>
          <PasswordInput value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" error={form.field("next")} hint={<PasswordHint password={next} email={me.user.email} />}>
          <PasswordInput value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" maxLength={128} />
        </Field>
        <Field label="New password again" error={mismatch ? "The two passwords don’t match." : null}>
          <PasswordInput value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" maxLength={128} />
        </Field>
        {form.general && (
          <p className="a-form__error" role="alert">
            {form.general}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" busy={busy} disabled={!current || !next || !again}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function groupKey(secret: string) {
  return secret.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function TwoFactorCard() {
  const toast = useToast();
  const { me, refreshMe } = useSession();
  const [setup, setSetup] = useState<TwoFactorStart | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useFieldFailure();

  async function run(action: () => Promise<void>) {
    setBusy(true);
    form.clear();
    try {
      await action();
    } catch (error) {
      form.set(error);
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      setSetup(await api.post<TwoFactorStart>("/auth/2fa/start"));
    });
  const enable = () =>
    run(async () => {
      await api.post("/auth/2fa/enable", { code: code.replace(/\s/g, "") });
      await refreshMe();
      setSetup(null);
      setCode("");
      toast("Authenticator app is on");
    });
  const disable = () =>
    run(async () => {
      await api.post("/auth/2fa/disable", { password, code: code.replace(/\s/g, "") });
      await refreshMe();
      setDisabling(false);
      setPassword("");
      setCode("");
      toast("Authenticator app is off");
    });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text.replace(/\s/g, ""));
      toast("Key copied");
    } catch {
      toast("Couldn’t copy. Select the key and copy it.", "error");
    }
  }

  const codeField = (
    <Field label="6-digit code" error={form.field("code")}>
      <TextInput value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} />
    </Field>
  );

  return (
    <Card title="Authenticator app" note={me.user.totpEnabled ? <Badge tone="green">On</Badge> : <Badge tone="red">Recommended</Badge>}>
      {me.user.totpEnabled ? (
        disabling ? (
          <div className="a-form">
            <Field label="Password" error={form.field("password")}>
              <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </Field>
            {codeField}
            {form.general && <p className="a-form__error" role="alert">{form.general}</p>}
            <div className="a-actions">
              <Button variant="ghost" onClick={() => setDisabling(false)}>
                Cancel
              </Button>
              <Button variant="danger" busy={busy} disabled={!password || !code} onClick={disable}>
                Turn off
              </Button>
            </div>
          </div>
        ) : (
          <div className="a-actions">
            <p className="a-meta">A code from your phone is asked for at every sign-in.</p>
            <Button onClick={() => setDisabling(true)}>Turn off</Button>
          </div>
        )
      ) : setup ? (
        <div className="a-form">
          <ol className="a-steps">
            <li>Open your authenticator app and add an account.</li>
            <li>
              Enter this key, or open it directly:
              <div className="a-key">
                <span className="a-key__text">{groupKey(setup.secret)}</span>
                <Button icon={<IconCopy />} onClick={() => void copy(setup.secret)}>
                  Copy
                </Button>
                <a className="a-btn a-btn--secondary" href={setup.otpauthUri}>
                  <IconExternal />
                  Open app
                </a>
              </div>
            </li>
            <li>Type the 6-digit code it shows.</li>
          </ol>
          {codeField}
          {form.general && <p className="a-form__error" role="alert">{form.general}</p>}
          <div className="a-actions">
            <Button variant="ghost" onClick={() => { setSetup(null); setCode(""); form.clear(); }}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy} disabled={code.replace(/\s/g, "").length < 6} onClick={enable}>
              Turn on
            </Button>
          </div>
        </div>
      ) : (
        <div className="a-actions">
          <p className="a-meta">Adds a second step at sign-in.</p>
          <Button variant="primary" busy={busy} onClick={start}>
            Set up
          </Button>
          {form.general && <p className="a-form__error" role="alert">{form.general}</p>}
        </div>
      )}
    </Card>
  );
}

function DevicesCard() {
  const toast = useToast();
  const sessions = useResource<{ items: SessionInfo[] }>("/sessions");
  const [busy, setBusy] = useState<string | null>(null);
  const items = sessions.data?.items ?? [];

  async function end(id: string) {
    setBusy(id);
    try {
      await api.del(`/sessions/${encodeURIComponent(id)}`);
      toast(id === "others" ? "Other devices signed out" : "Device signed out");
      sessions.reload();
    } catch (error) {
      toast(asFailure(error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Signed-in devices"
      note={
        items.length > 1 ? (
          <Button onClick={() => void end("others")} busy={busy === "others"}>
            Sign out others
          </Button>
        ) : undefined
      }
    >
      {sessions.error && !sessions.data ? (
        <ErrorNote error={sessions.error} onRetry={sessions.reload} />
      ) : !sessions.data ? (
        <Loading />
      ) : (
        <ul className="a-devices">
          {items.map((session) => (
            <li key={session.id} className="a-device">
              <IconDevice />
              <span className="a-device__text">
                <span className="a-device__name">
                  {session.device || "Unknown device"} {session.current && <Badge tone="green">This device</Badge>}
                </span>
                <span className="a-device__meta">Active {timeAgo(session.lastSeenAt).toLowerCase()}</span>
              </span>
              {!session.current && (
                <Button variant="ghost" onClick={() => void end(session.id)} busy={busy === session.id}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityCard() {
  const activity = usePaged<AuditEntry>("/audit?limit=20");
  return (
    <Card title="Recent activity">
      {activity.error && activity.items.length === 0 ? (
        <ErrorNote error={activity.error} onRetry={activity.reload} />
      ) : activity.loading && activity.items.length === 0 ? (
        <Loading />
      ) : activity.items.length === 0 ? (
        <Empty title="Nothing yet" />
      ) : (
        <>
          <ul className="a-activity">
            {activity.items.map((entry) => (
              <li key={entry.id} className="a-activity__item">
                <span className="a-activity__what">
                  {entry.action}
                  {entry.entity ? ` · ${entry.entity}${entry.entityId ? ` ${entry.entityId}` : ""}` : ""}
                  {entry.detail && <span className="a-activity__detail"> {entry.detail}</span>}
                </span>
                <span className="a-activity__when">
                  {entry.userEmail ? `${entry.userEmail} · ` : ""}
                  {dateTime(entry.at)}
                </span>
              </li>
            ))}
          </ul>
          {activity.hasMore && (
            <div className="a-more-row">
              <Button onClick={() => void activity.loadMore()} busy={activity.loadingMore}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
