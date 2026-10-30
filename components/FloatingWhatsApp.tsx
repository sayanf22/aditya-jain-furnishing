import { WhatsAppIcon } from "./icons";

// WhatsApp button fixed on the right side of every page (agreement §06).
export function FloatingWhatsApp({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Enquire on WhatsApp"
      className="btn group fixed right-4 bottom-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-[0_10px_30px_-8px_rgba(31,168,85,0.6)] hover:shadow-[0_14px_34px_-8px_rgba(31,168,85,0.75)] sm:right-6 sm:bottom-6 sm:h-16 sm:w-16"
    >
      <WhatsAppIcon className="h-7 w-7 sm:h-8 sm:w-8" />
      <span className="pointer-events-none absolute right-full mr-3 hidden translate-x-2 rounded-full bg-ink px-4 py-2 text-[0.8rem] font-medium whitespace-nowrap text-ivory opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:block">
        Chat on WhatsApp
      </span>
    </a>
  );
}
