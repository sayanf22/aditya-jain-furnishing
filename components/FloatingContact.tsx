"use client";

// The enquiry button fixed on the right of every page. One round button with
// an enquiry icon; hovering it (or focusing it, or tapping it on a phone)
// opens three ways to reach the showroom: Call, Message and Enquire (the
// enquiry form). Only opacity and transform animate. Esc, a tap elsewhere or
// leaving the area closes it. Without JavaScript the button still goes
// straight to the enquiry form.
import { useEffect, useRef, useState } from "react";
import { EnquiryIcon, CloseIcon, PhoneIcon, SendIcon, WhatsAppIcon } from "./icons";
import { SiteLink } from "./SiteLink";

type Props = { phoneHref: string | null; messageHref: string | null };

export function FloatingContact({ phoneHref, messageHref }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const pointer = useRef<string>("mouse");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const options = [
    phoneHref && { key: "call", label: "Call", href: phoneHref, icon: <PhoneIcon className="h-[1.15rem] w-[1.15rem]" />, external: false },
    messageHref && { key: "message", label: "Message", href: messageHref, icon: <WhatsAppIcon className="h-[1.15rem] w-[1.15rem]" />, external: true },
    { key: "enquire", label: "Enquire", href: "/#enquire", icon: <SendIcon className="h-[1.15rem] w-[1.15rem]" />, external: false, internal: true },
  ].filter(Boolean) as { key: string; label: string; href: string; icon: React.ReactNode; external: boolean; internal?: boolean }[];

  return (
    <div
      ref={root}
      className="float-contact fixed right-4 bottom-5 z-30 flex flex-col items-end gap-2.5 sm:right-6 sm:bottom-6"
      data-open={open}
      onMouseEnter={() => {
        // Hover opens it for a mouse; a finger opens it by tapping the button.
        window.clearTimeout(closeTimer.current);
        if (window.matchMedia("(hover: hover)").matches) setOpen(true);
      }}
      onMouseLeave={() => {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => setOpen(false), 300);
      }}
    >
      <ul id="float-contact-menu" className="float-contact-menu flex flex-col items-end gap-2.5" aria-label="Contact options" inert={!open}>
        {options.map((o, i) => {
          const className =
            "float-contact-item btn flex h-12 items-center gap-2.5 rounded-full bg-white pr-5 pl-4 text-[0.88rem] font-medium text-ink shadow-[0_14px_30px_-14px_rgba(20,20,20,0.5)] ring-1 ring-ink/10 hover:bg-ink hover:text-ivory";
          return (
            <li key={o.key} style={{ ["--i" as string]: options.length - 1 - i } as React.CSSProperties}>
              {o.internal ? (
                <SiteLink href={o.href} className={className} onClick={() => setOpen(false)}>
                  <span className="text-terracotta">{o.icon}</span>
                  {o.label}
                </SiteLink>
              ) : (
                <a href={o.href} {...(o.external ? { target: "_blank", rel: "noopener" } : {})} className={className} onClick={() => setOpen(false)}>
                  <span className="text-terracotta">{o.icon}</span>
                  {o.label}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        aria-expanded={open}
        aria-controls="float-contact-menu"
        aria-label={open ? "Close contact options" : "Contact options"}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onClick={(e) => {
          // With a mouse, hovering has already opened it: a click keeps it open
          // instead of closing it again. A finger, a pen or the keyboard toggles.
          if (e.detail > 0 && pointer.current === "mouse" && open) return;
          setOpen((v) => !v);
        }}
        className="float-wa flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-ivory shadow-[0_12px_32px_-10px_rgba(179,0,0,0.55)] ring-1 ring-white/20"
      >
        <span className="float-contact-icon relative block h-6 w-6">
          <EnquiryIcon className="absolute inset-0 h-6 w-6 transition-[opacity,transform] duration-300" />
          <CloseIcon className="absolute inset-0 h-6 w-6 transition-[opacity,transform] duration-300" />
        </span>
      </button>
    </div>
  );
}
