"use client";

import { useCallback, useEffect, useState } from "react";
import type { Page } from "@/lib/admin-api";
import { ApiFailure, api, asFailure } from "./api";

type Settled<T> = { key: string; data?: T; error?: ApiFailure };

/** Loads one JSON resource. Keeps the previous data on screen while reloading. */
export function useResource<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Settled<T> | null>(null);
  const key = `${path}#${tick}`;

  useEffect(() => {
    if (path === null) return;
    let live = true;
    api.get<T>(path).then(
      (data) => live && setState({ key, data }),
      (error: unknown) => live && setState({ key, error: asFailure(error) }),
    );
    return () => {
      live = false;
    };
  }, [path, key]);

  const current = state?.key === key ? state : null;
  const reload = useCallback(() => setTick((value) => value + 1), []);
  const mutate = useCallback((change: (data: T) => T) => {
    setState((previous) => (previous?.data === undefined ? previous : { ...previous, data: change(previous.data) }));
  }, []);

  return {
    data: state?.data,
    error: current?.error ?? null,
    loading: path !== null && current === null,
    reload,
    mutate,
  };
}

type PagedState<T, R> = { key: string; items: T[]; next: string | null; meta?: R; error?: ApiFailure };

/** Loads a cursor-paged list; loadMore() appends the next page. */
export function usePaged<T, R extends Page<T> = Page<T>>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<PagedState<T, R> | null>(null);
  const [more, setMore] = useState(false);
  const key = `${path}#${tick}`;

  useEffect(() => {
    if (path === null) return;
    let live = true;
    api.get<R>(path).then(
      (page) => live && setState({ key, items: page.items, next: page.nextCursor, meta: page }),
      (error: unknown) => live && setState({ key, items: [], next: null, error: asFailure(error) }),
    );
    return () => {
      live = false;
    };
  }, [path, key]);

  const current = state?.key === key ? state : null;

  const loadMore = useCallback(async () => {
    if (path === null || !state?.next) return;
    setMore(true);
    try {
      const joiner = path.includes("?") ? "&" : "?";
      const page = await api.get<Page<T>>(`${path}${joiner}cursor=${encodeURIComponent(state.next)}`);
      setState((previous) => (previous ? { ...previous, items: [...previous.items, ...page.items], next: page.nextCursor } : previous));
    } catch (error) {
      setState((previous) => (previous ? { ...previous, error: asFailure(error) } : previous));
    } finally {
      setMore(false);
    }
  }, [path, state?.next]);

  const mutate = useCallback((change: (items: T[]) => T[]) => {
    setState((previous) => (previous ? { ...previous, items: change(previous.items) } : previous));
  }, []);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  return {
    items: state?.items ?? [],
    meta: state?.meta,
    hasMore: Boolean(state?.next),
    error: state?.error ?? null,
    loading: path !== null && current === null,
    loadingMore: more,
    loadMore,
    mutate,
    reload,
  };
}

/** True when the visitor asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Wait helper for chained UI steps. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
