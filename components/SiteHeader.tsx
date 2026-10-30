"use client";

// Site header. On the Home page it sits transparent over the hero and turns
// solid ivory once the visitor scrolls; on other pages it is solid. The
// phone menu slides in and closes on link tap or Escape.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "@/lib/nav";
import { CloseIcon, MenuIcon, PhoneIcon, WhatsAppIcon } from "./icons";
import { SiteLink } from "./SiteLink";

type Props = {
  brand: string;
  phoneHref: string | null;
  whatsappHref: string | null;
};

export function SiteHeader({ brand, phoneHref, whatsappHref }: Props) {
  const pathname = usePathname();
  const overlay = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const solid = !overlay || scrolled || open;
  const [first, ...rest] = brand.split(" ");

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,color] duration-500 ${
        solid ? "bg-ivory/95 text-ink shadow-[0_1px_0_rgba(31,27,23,0.08)] backdrop-blur-md" : "bg-transparent text-white"
      }`}
    >
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-5 sm:h-20 sm:px-8">
        <nav aria-label="Main" className="hidden items-center gap-7 text-[0.8rem] font-medium tracking-[0.12em] uppercase lg:flex">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className="link-line py-1"
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </SiteLink>
          ))}
        </nav>
        <button
          type="button"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>

        <SiteLink href="/" className="justify-self-center text-center leading-none" aria-label={`${brand}, home`}>
          <span className="block text-[1.05rem] font-semibold tracking-[0.28em] uppercase sm:text-[1.2rem]">{first}</span>
          <span className="mt-1 block text-[0.62rem] font-medium tracking-[0.42em] uppercase opacity-80 sm:text-[0.68rem]">
            {rest.join(" ")}
          </span>
        </SiteLink>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          {phoneHref && (
            <a
              href={phoneHref}
              aria-label="Call the showroom"
              className={`btn flex h-10 w-10 items-center justify-center gap-2 rounded-full border text-[0.78rem] font-medium tracking-[0.1em] uppercase sm:w-auto sm:px-4 ${
                solid ? "border-ink/15 hover:bg-ink hover:text-ivory" : "border-white/40 hover:bg-white hover:text-ink"
              }`}
            >
              <PhoneIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Call</span>
            </a>
          )}
          {/* On phones the fixed WhatsApp button covers this, so it's hidden here. */}
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener"
              className="btn hidden h-10 items-center gap-2 rounded-full bg-terracotta px-4 text-[0.78rem] font-medium tracking-[0.1em] text-white uppercase hover:bg-terracotta-dark sm:flex"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Enquire
            </a>
          )}
        </div>
      </div>

      <div
        id="mobile-menu"
        className={`fixed inset-x-0 top-16 bottom-0 bg-ivory text-ink transition-[opacity,transform] duration-500 ease-[var(--ease-out-soft)] lg:hidden ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <nav aria-label="Mobile" className="flex flex-col px-6 pt-6">
          {NAV.map((item, i) => (
            <SiteLink
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className="border-b border-ink/10 py-5 text-2xl font-medium transition-[opacity,transform] duration-500"
              style={{
                transitionDelay: open ? `${80 + i * 60}ms` : "0ms",
                opacity: open ? 1 : 0,
                transform: open ? "none" : "translateY(10px)",
              }}
            >
              {item.label}
            </SiteLink>
          ))}
        </nav>
        {phoneHref && (
          <div className="px-6 pt-8">
            <a
              href={phoneHref}
              tabIndex={open ? 0 : -1}
              className="btn flex h-14 items-center justify-center gap-2 rounded-full border border-ink/15 text-sm font-medium tracking-[0.1em] uppercase"
            >
              <PhoneIcon className="h-5 w-5" />
              Call the showroom
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
