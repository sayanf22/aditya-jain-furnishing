"use client";

// Signed-in state for the dashboard: loads /me once, keeps the CSRF token for
// api.ts, and sends the person to sign in (or first-run setup) when needed.
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthStatus, MeResponse } from "@/lib/admin-api";
import { ApiFailure, api, asFailure, setCsrf, setSignedOutHandler } from "./api";
import { Button, Loading } from "./ui";

type SessionValue = {
  me: MeResponse;
  unread: number;
  setUnread: (count: number) => void;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs SessionProvider");
  return value;
}

type State = { phase: "loading" } | { phase: "ready"; me: MeResponse } | { phase: "error"; error: ApiFailure };

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [unread, setUnread] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const me = await api.get<MeResponse>("/me");
        if (!live) return;
        setCsrf(me.csrf);
        setState({ phase: "ready", me });
      } catch (error) {
        if (!live) return;
        const failure = asFailure(error);
        if (failure.status === 401) {
          try {
            const status = await api.get<AuthStatus>("/auth/status");
            router.replace(status.setupRequired ? "/admin/setup" : "/admin/login");
            return;
          } catch (statusError) {
            if (live) setState({ phase: "error", error: asFailure(statusError) });
            return;
          }
        }
        setState({ phase: "error", error: failure });
      }
    })();
    return () => {
      live = false;
    };
  }, [router, attempt]);

  useEffect(() => {
    if (state.phase !== "ready") return;
    setSignedOutHandler(() => router.replace("/admin/login"));
    return () => setSignedOutHandler(null);
  }, [state.phase, router]);

  const refreshMe = useCallback(async () => {
    const me = await api.get<MeResponse>("/me");
    setCsrf(me.csrf);
    setState({ phase: "ready", me });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setCsrf("");
      router.replace("/admin/login");
    }
  }, [router]);

  const value = useMemo<SessionValue | null>(
    () => (state.phase === "ready" ? { me: state.me, unread, setUnread, refreshMe, signOut } : null),
    [state, unread, refreshMe, signOut],
  );

  if (state.phase === "error") {
    return (
      <div className="a-splash">
        <p className="a-splash__text">{state.error.message}</p>
        <Button variant="primary" onClick={() => { setState({ phase: "loading" }); setAttempt((n) => n + 1); }}>
          Try again
        </Button>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="a-splash">
        <Loading label="Opening the dashboard" />
      </div>
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
