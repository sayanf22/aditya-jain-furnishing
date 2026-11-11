import { WhatsAppIcon } from "./icons";

// WhatsApp button fixed on the right side of every page (agreement §06), in
// the brand terracotta. On desktop a label slides out on hover.
export function FloatingWhatsApp({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Enquire"
      className="float-wa group fixed right-4 bottom-5 z-30 flex h-14 items-center rounded-full bg-terracotta text-ivory shadow-[0_12px_32px_-10px_rgba(138,72,54,0.7)] ring-1 ring-white/20 sm:right-6 sm:bottom-6"
    >
      <span className="float-wa-label grid grid-cols-[0fr] transition-[grid-template-columns] duration-500 ease-[var(--ease-out-soft)] group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]">
        <span className="overflow-hidden">
          <span className="block pl-5 text-[0.82rem] font-medium tracking-[0.06em] whitespace-nowrap">Enquire</span>
        </span>
      </span>
      <span className="flex h-14 w-14 items-center justify-center">
        <WhatsAppIcon className="h-6 w-6" />
      </span>
    </a>
  );
}
