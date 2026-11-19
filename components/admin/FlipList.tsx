"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "./hooks";

export const SLIDE_MS = 380;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type FlipListProps = {
  className?: string;
  /** Ids in display order. When this changes, rows slide from where they were. */
  order: string;
  children: ReactNode;
};

/**
 * A list whose rows slide to their new place when the order changes.
 * Each child must be an <li data-flip="id">. Only transform is animated.
 */
export function FlipList({ className, order, children }: FlipListProps) {
  const list = useRef<HTMLUListElement>(null);
  const tops = useRef(new Map<string, number>());
  const lastOrder = useRef(order);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const rows = Array.from(element.children) as HTMLElement[];
    const next = new Map<string, number>();
    for (const row of rows) next.set(row.dataset.flip ?? "", row.offsetTop);

    if (lastOrder.current !== order && !prefersReducedMotion()) {
      for (const row of rows) {
        const before = tops.current.get(row.dataset.flip ?? "");
        if (before === undefined) continue;
        const shift = before - row.offsetTop;
        if (shift !== 0) row.animate([{ transform: `translateY(${shift}px)` }, { transform: "none" }], { duration: SLIDE_MS, easing: EASE });
      }
    }
    lastOrder.current = order;
    tops.current = next;
  });

  return (
    <ul ref={list} className={className}>
      {children}
    </ul>
  );
}
