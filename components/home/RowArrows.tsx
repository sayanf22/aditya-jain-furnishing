"use client";

// Previous / next buttons for a sideways row of cards (the home page's collections when there
// are more than fit in one row). They appear only while the row really scrolls, and each press
// moves the row by one card with a smooth slide (a jump when the visitor asked for less motion).
// Swipe, trackpad and keyboard scrolling keep working; the buttons are an extra.
import { useEffect, useState } from "react";
import { ArrowRightIcon } from "../icons";

export function RowArrows({ targetId, label }: { targetId: string; label: string }) {
  const [state, setState] = useState({ scrolls: false, start: true, end: false });

  useEffect(() => {
    const row = document.getElementById(targetId);
    if (!row) return;
    const measure = () => {
      const max = row.scrollWidth - row.clientWidth;
      setState({ scrolls: max > 4, start: row.scrollLeft <= 4, end: row.scrollLeft >= max - 4 });
    };
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [targetId]);

  function go(direction: 1 | -1) {
    const row = document.getElementById(targetId);
    if (!row) return;
    const card = row.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width : row.clientWidth * 0.8;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: direction * step, behavior: calm ? "auto" : "smooth" });
  }

  if (!state.scrolls) return null;
  const base =
    "row-arrow inline-flex h-12 w-12 items-center justify-center rounded-full border border-ink/15 bg-white text-ink transition-[opacity,background-color,color,border-color] duration-300 hover:border-ink hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="mt-6 hidden items-center justify-center gap-3 sm:flex" role="group" aria-label={label}>
      <button type="button" className={base} onClick={() => go(-1)} disabled={state.start} aria-label="Previous">
        <ArrowRightIcon className="h-4 w-4 rotate-180" />
      </button>
      <button type="button" className={base} onClick={() => go(1)} disabled={state.end} aria-label="Next">
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
