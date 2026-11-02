"use client";

// One observer for the whole site: elements marked data-reveal fade and
// rise in, and data-words headings play word by word, the first time they
// come on screen (see globals.css).
//
// The "shown" mark is an attribute (data-shown), not a class: React owns an
// element's class list and rewrites it whenever it re-renders that element
// (a hot reload in development, or a prop change), which would drop the
// mark and leave the element hidden. React never touches attributes it
// didn't render, so data-shown stays put.
//
// This sits in the root layout, which stays mounted across client-side
// navigation. So besides the elements present at start-up, it also watches
// for elements added later (a page reached through a link, a section that
// streams in or is replaced), otherwise those would stay hidden.
import { useEffect } from "react";

const SELECTOR = "[data-reveal]:not([data-shown]), [data-words]:not([data-shown])";

// Each Home section hydrates on its own (Suspense). Marking an element
// before React has taken it over would make React report an attribute it
// didn't render, so wait for React's own reference on the element (checked
// once per frame, at most ~2 s, then mark it anyway).
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
function show(el: Element, tries = 0) {
  if (hydrated(el) || tries > 120) el.setAttribute("data-shown", "");
  else requestAnimationFrame(() => show(el, tries + 1));
}

export function RevealObserver() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      const showAll = () => document.querySelectorAll(SELECTOR).forEach((el) => show(el));
      showAll();
      const mo = new MutationObserver(showAll);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show(entry.target);
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    // Observing an element twice is harmless, but skip the ones already seen.
    const seen = new WeakSet<Element>();
    const watch = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      io.observe(el);
    };
    document.querySelectorAll(SELECTOR).forEach(watch);

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(SELECTOR)) watch(node);
          node.querySelectorAll(SELECTOR).forEach(watch);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);
  return null;
}
