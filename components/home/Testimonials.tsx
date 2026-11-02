// Section 05 · Customer testimonials, placed right after Watch & Buy.
// Shows only reviews added in the dashboard; hidden when there are none.
import type { Testimonial } from "@/lib/content";
import { QuoteIcon } from "../icons";
import { Words } from "../Words";

export function Testimonials({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section className="bg-ivory pt-4 pb-20 sm:pb-28 lg:pb-32" aria-labelledby="testimonials-title">
      <div className="shell">
        <div className="text-center">
          <p className="section-label" data-reveal>
            Testimonials
          </p>
          <h2 id="testimonials-title" className="section-title mt-3" data-words>
            <Words parts={["What our", { accent: "customers say" }]} />
          </h2>
        </div>
        <ul className="no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:scroll-px-8 sm:px-8 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          {items.map((t, i) => (
            <li
              key={t.id}
              className="flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-[1.5rem] bg-white p-7 shadow-[0_1px_0_rgba(31,27,23,0.05),0_22px_44px_-32px_rgba(31,27,23,0.4)] md:w-auto md:max-w-none"
              data-reveal
              style={{ ["--reveal-delay" as string]: i }}
            >
              <QuoteIcon className="h-8 w-8 text-terracotta/80" />
              <blockquote className="mt-4 flex-1 text-[1.02rem] leading-relaxed text-ink-soft">{t.text}</blockquote>
              <p className="mt-6 text-[0.82rem] font-semibold tracking-[0.1em] uppercase">{t.name}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
