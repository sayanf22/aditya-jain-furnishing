"use client";

// Site header. On the Home page it sits transparent over the hero and turns
// solid ivory once the visitor scrolls; on other pages it is solid.
//
// Phone menu: a full-screen panel below the header. It fades and settles
// into place, the links follow one by one, and the menu icon's three lines
// turn into a cross. Only opacity and transform animate. The panel sits
// outside <header> on purpose: the header's backdrop blur would otherwise
// trap the fixed panel inside the header's own box.
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { NAV } from "@/lib/nav";
import { ArrowRightIcon, PhoneIcon, WhatsAppIcon } from "./icons";
import { SiteLink } from "./SiteLink";

type Props = {
  brand: string;
  phoneHref: string | null;
  whatsappHref: string | null;
  address: string;
};

export function SiteHeader({ brand, phoneHref, whatsappHref, address }: Props) {
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

  // Close the menu after navigating (state adjusted during render, as React
  // recommends, instead of in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => window.innerWidth >= 1024 && setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const solid = !overlay || scrolled || open;
  const [first, ...rest] = brand.split(" ");

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,color] duration-500 ${
          solid ? "bg-ivory/95 text-ink shadow-[0_1px_0_rgba(31,27,23,0.08)] backdrop-blur-md" : "bg-transparent text-white"
        }`}
      >
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-5 sm:h-20 sm:px-8">
          <nav aria-label="Main" className="hidden items-center gap-7 text-[0.8rem] font-medium tracking-[0.12em] uppercase lg:flex">
            {NAV.map((item) => (
              <SiteLink key={item.href} href={item.href} className="link-line py-1" aria-current={pathname === item.href ? "page" : undefined}>
                {item.label}
              </SiteLink>
            ))}
          </nav>

          <button
            type="button"
            className="burger -ml-2 flex h-11 w-11 flex-col items-center justify-center gap-[4px] rounded-full lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block h-[1.6px] w-[22px] rounded-full bg-current" />
            <span className="block h-[1.6px] w-[22px] rounded-full bg-current" />
            <span className="block h-[1.6px] w-[22px] rounded-full bg-current" />
          </button>

          <SiteLink href="/" className="justify-self-center text-center leading-none" aria-label={`${brand}, home`}>
            <span className="block text-[1.05rem] font-semibold tracking-[0.28em] uppercase sm:text-[1.2rem]">{first}</span>
            <span className="mt-1 block text-[0.62rem] font-medium tracking-[0.42em] uppercase opacity-80 sm:text-[0.68rem]">{rest.join(" ")}</span>
          </SiteLink>

          <div className="flex items-center justify-end gap-2 sm:gap-3">
            {phoneHref && (
              <a
                href={phoneHref}
                aria-label="Call the showroom"
                className={`btn flex h-10 w-10 items-center justify-center gap-2 rounded-full border text-[0.78rem] font-medium tracking-[0.1em] uppercase sm:w-auto sm:px-4 ${
                  solid ? "border-ink/15 hover:border-ink hover:bg-ink hover:text-ivory" : "border-white/40 hover:bg-white hover:text-ink"
                }`}
              >
                <PhoneIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Call</span>
              </a>
            )}
            {/* On phones the fixed WhatsApp button does this job. */}
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
      </header>

      <div
        id="mobile-menu"
        data-open={open}
        aria-hidden={!open}
        className={`menu-panel fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col bg-ivory text-ink lg:hidden ${
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-4 opacity-0"
        }`}
      >
        <p className="menu-item px-6 pt-8 text-[0.7rem] font-semibold tracking-[0.24em] text-terracotta uppercase" style={item(0, open)}>
          Menu
        </p>
        <nav aria-label="Mobile" className="flex flex-col px-6 pt-3">
          {NAV.map((link, i) => (
            <SiteLink
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              aria-current={pathname === link.href ? "page" : undefined}
              className="menu-item group flex items-center justify-between border-b border-ink/10 py-5 text-[1.75rem] leading-none font-medium"
              style={item(i + 1, open)}
            >
              {link.label}
              <ArrowRightIcon className="h-5 w-5 text-ink/40 transition-transform duration-300 group-active:translate-x-1" />
            </SiteLink>
          ))}
        </nav>

        <div className="menu-item mt-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" style={item(NAV.length + 1, open)}>
          <div className="grid grid-cols-2 gap-3">
            {phoneHref && (
              <a href={phoneHref} tabIndex={open ? 0 : -1} className="btn flex h-14 items-center justify-center gap-2 rounded-2xl border border-ink/15 text-[0.85rem] font-medium">
                <PhoneIcon className="h-5 w-5" />
                Call
              </a>
            )}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener"
                tabIndex={open ? 0 : -1}
                className="btn flex h-14 items-center justify-center gap-2 rounded-2xl bg-terracotta text-[0.85rem] font-medium text-white"
              >
                <WhatsAppIcon className="h-5 w-5" />
                WhatsApp
              </a>
            )}
          </div>
          <p className="mt-5 text-center text-[0.82rem] leading-relaxed text-muted">{address}</p>
        </div>
      </div>
    </>
  );
}

function item(i: number, open: boolean): CSSProperties {
  return {
    ["--i" as string]: i,
    opacity: open ? 1 : 0,
    transform: open ? "none" : "translate3d(0, 14px, 0)",
  };
}
