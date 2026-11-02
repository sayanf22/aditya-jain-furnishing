"use client";

// One observer for the whole site: elements marked data-reveal fade and
// rise in, and data-words headings play word by word, the first time they
// come on screen (see globals.css).
//
// This sits in the root layout, which stays mounted across client-side
// navigation. So besides the elements present at start-up, it also watches
// for elements added later (a page reached through a link, a section that
// streams in), otherwise those would stay hidden.
import { useEffect } from "react";

const SELECTOR = "[data-reveal]:not(.is-visible), [data-words]:not(.is-visible)";

export function RevealObserver() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      const showAll = () => document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => el.classList.add("is-visible"));
      showAll();
      const mo = new MutationObserver(showAll);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
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
