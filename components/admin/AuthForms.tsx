"use client";

// Sign in (with the authenticator step when it is on) and first-run setup.
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { LoginBody, LoginResponse, MeResponse, SetupBody } from "@/lib/admin-api";
import { ApiFailure, api, asFailure, setCsrf } from "./api";
import { type AuthStatusWithEmail, type CodeVerifyResponse, emailCodesAvailable } from "./email-code";
import { IconCheck } from "./icons";
import { Button, Field, Loading, PasswordInput, TextInput } from "./ui";

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="a-auth">
      <div className="a-auth__card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="a-auth__logo" src="/brand/logo-color.webp" alt="Delta Furnishings" width={600} height={209} />
        <h1 className="a-auth__title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Shows the failure beside the field it names, or as a general line under the form. */
function useFormError() {
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  return {
    failure,
    set: (error: unknown) => setFailure(asFailure(error)),
    clear: () => setFailure(null),
    forField: (name: string) => (failure?.field === name ? failure.message : null),
    general: failure && !failure.field ? waitMessage(failure) : null,
  };
}

function waitMessage(failure: ApiFailure): string {
  if (failure.status === 429 && failure.retryAfter) {
    const minutes = Math.ceil(failure.retryAfter / 60);
    return `Too many tries. Wait ${minutes <= 1 ? "a minute" : `${minutes} minutes`} and try again.`;
  }
  return failure.message;
}

/** Sends people who should not be here on to the right page. */
function useAuthRedirect(wantSetup: boolean) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<AuthStatusWithEmail | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await api.get<MeResponse>("/me");
        if (live) router.replace("/admin");
        return;
      } catch {
        // Not signed in: expected here.
      }
      try {
        const found = await api.get<AuthStatusWithEmail>("/auth/status");
        if (!live) return;
        setStatus(found);
        if (found.setupRequired !== wantSetup) router.replace(found.setupRequired ? "/admin/setup" : "/admin/login");
        else setReady(true);
      } catch {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [router, wantSetup]);
  return { ready, status };
}

type Step = "password" | "email" | "code" | "totp" | "newpass";
const TITLES: Record<Step, string> = {
  password: "Sign in",
  email: "Email me a code",
  code: "Enter the code",
  totp: "Enter your code",
  newpass: "New password",
};

export function SignInScreen() {
  const router = useRouter();
  const { ready, status } = useAuthRedirect(false);
  const emailOn = emailCodesAvailable(status);
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(""); // authenticator or emailed code, depending on step
  const [next, setNext] = useState("");
  const [emailed, setEmailed] = useState(""); // the emailed code, kept while the authenticator code is asked for
  const [needsTotp, setNeedsTotp] = useState(false); // 2FA after a password sign-in
  const [busy, setBusy] = useState(false);
  const form = useFormError();

  const go = (to: Step) => {
    setStep(to);
    setCode("");
    form.clear();
  };

  async function finish(me?: MeResponse) {
    const current = me ?? (await api.get<MeResponse>("/me"));
    setCsrf(current.csrf);
    router.replace("/admin");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    form.clear();
    try {
      const digits = code.replace(/\s/g, "");
      if (step === "password" || step === "totp") {
        const body: LoginBody = { email: email.trim(), password, ...(needsTotp ? { code: digits } : {}) };
        const result = await api.post<LoginResponse>("/auth/login", body);
        if ("needsCode" in result) {
          setNeedsTotp(true);
          go("totp");
          setBusy(false);
          return;
        }
        await finish();
        return;
      }
      if (step === "email") {
        await api.post("/auth/code/request", { email: email.trim() });
        go("code");
        setBusy(false);
        return;
      }
      if (step === "code") {
        setEmailed(digits);
        const result = await api.post<CodeVerifyResponse>("/auth/code/verify", { email: email.trim(), code: digits });
        // An emailed code never replaces the authenticator code.
        go("needsCode" in result ? "totp" : "newpass");
        setNeedsTotp(false);
        setBusy(false);
        return;
      }
      const me = await api.post<MeResponse>("/auth/code/password", { next });
      await finish(me);
    } catch (error) {
      form.set(error);
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <AuthCard title="Sign in">
        <Loading />
      </AuthCard>
    );
  }

  // The authenticator step after an emailed code asks again with the same endpoint.
  const emailedTotp = step === "totp" && !needsTotp;
  async function submitEmailedTotp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    form.clear();
    try {
      const result = await api.post<CodeVerifyResponse>("/auth/code/verify", { email: email.trim(), code: emailed, totp: code.replace(/\s/g, "") });
      if ("needsCode" in result) throw new ApiFailure(400, "INVALID", "That code is not right.", "code");
      go("newpass");
      setEmailed("");
      setBusy(false);
    } catch (error) {
      form.set(error);
      setBusy(false);
    }
  }

  return (
    <AuthCard title={TITLES[step]}>
      <form className="a-form" onSubmit={emailedTotp ? submitEmailedTotp : submit} noValidate>
        {step === "password" && (
          <>
            <Field label="Email" error={form.forField("email")}>
              <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoFocus required />
            </Field>
            <Field label="Password" error={form.forField("password")}>
              <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </Field>
          </>
        )}
        {step === "email" && (
          <Field label="Email" error={form.forField("email")} hint="We send a 6-digit code if this is the owner's email.">
            <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoFocus required />
          </Field>
        )}
        {step === "code" && (
          <Field label="6-digit code" error={form.forField("code")} hint="Check your email. It works for 10 minutes.">
            <TextInput value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus required />
          </Field>
        )}
        {step === "totp" && (
          <Field label="6-digit code" error={form.forField("code")} hint="From your authenticator app">
            <TextInput value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus required />
          </Field>
        )}
        {step === "newpass" && (
          <Field label="New password" error={form.forField("next") ?? form.forField("password")} hint={<PasswordHint password={next} email={email} />}>
            <PasswordInput value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" maxLength={128} autoFocus required />
          </Field>
        )}
        {form.general && (
          <p className="a-form__error" role="alert">
            {form.general}
          </p>
        )}
        <Button type="submit" variant="primary" busy={busy} className="a-btn--block">
          {{ password: "Sign in", email: "Send code", code: "Continue", totp: "Verify", newpass: "Save and sign in" }[step]}
        </Button>
        {step === "password" &&
          (emailOn ? (
            <button type="button" className="a-authlink" onClick={() => go("email")}>
              Forgot password? Email me a code
            </button>
          ) : (
            <p className="a-authnote">Forgot password? Emailed codes are not set up yet.</p>
          ))}
        {step !== "password" && step !== "newpass" && (
          <Button
            variant="ghost"
            className="a-btn--block"
            onClick={() => {
              setNeedsTotp(false);
              go("password");
            }}
          >
            Back
          </Button>
        )}
      </form>
    </AuthCard>
  );
}
const MIN_PASSWORD = 12;

export function PasswordHint({ password, email }: { password: string; email?: string }) {
  const longEnough = password.length >= MIN_PASSWORD;
  const differs = !email || password.toLowerCase() !== email.trim().toLowerCase();
  const ok = longEnough && differs;
  return (
    <span className={ok ? "a-hint a-hint--ok" : "a-hint"}>
      {ok && <IconCheck />}
      At least {MIN_PASSWORD} characters. A few random words work well.
    </span>
  );
}

export function SetupScreen() {
  const router = useRouter();
  const { ready } = useAuthRedirect(true);
  const [values, setValues] = useState({ setupCode: "", name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const form = useFormError();
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    form.clear();
    try {
      const body: SetupBody = { setupCode: values.setupCode.trim(), email: values.email.trim(), name: values.name.trim() || undefined, password: values.password };
      const me = await api.post<MeResponse>("/auth/setup", body);
      setCsrf(me.csrf);
      router.replace("/admin");
    } catch (error) {
      form.set(error);
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <AuthCard title="Set up">
        <Loading />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set up your dashboard">
      <form className="a-form" onSubmit={submit} noValidate>
        <Field label="Setup code" error={form.forField("setupCode")} hint="The code you were given">
          <TextInput value={values.setupCode} onChange={set("setupCode")} autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus required />
        </Field>
        <Field label="Your name" error={form.forField("name")}>
          <TextInput value={values.name} onChange={set("name")} autoComplete="name" maxLength={80} />
        </Field>
        <Field label="Email" error={form.forField("email")}>
          <TextInput type="email" value={values.email} onChange={set("email")} autoComplete="username" required />
        </Field>
        <Field label="Password" error={form.forField("password")} hint={<PasswordHint password={values.password} email={values.email} />}>
          <PasswordInput value={values.password} onChange={set("password")} autoComplete="new-password" maxLength={128} required />
        </Field>
        {form.general && (
          <p className="a-form__error" role="alert">
            {form.general}
          </p>
        )}
        <Button type="submit" variant="primary" busy={busy} className="a-btn--block">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
