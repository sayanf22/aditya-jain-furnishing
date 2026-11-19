"use client";

// Frame around every signed-in screen: sidebar on desktop, bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { Enquiry, Page } from "@/lib/admin-api";
import { api } from "./api";
import { IconCollections, IconDesigns, IconEnquiries, IconExternal, IconLogout, IconMore, IconOverview, IconPhotos, IconSecurity, IconSite } from "./icons";
import { SessionProvider, useSession } from "./session";
import { Sheet, ToastProvider, cx } from "./ui";

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: IconOverview },
  { href: "/admin/collections", label: "Collections", icon: IconCollections },
  { href: "/admin/designs", label: "Designs", icon: IconDesigns },
  { href: "/admin/photos", label: "Photos", icon: IconPhotos },
  { href: "/admin/site", label: "Site", icon: IconSite },
  { href: "/admin/enquiries", label: "Enquiries", icon: IconEnquiries },
  { href: "/admin/security", label: "Security", icon: IconSecurity },
];
const TABS = NAV.slice(0, 4);
const MORE = NAV.slice(4);

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src="/brand/logo-color.webp" alt="Delta Furnishings" width={600} height={209} />
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, unread, setUnread, signOut } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api.get<Page<Enquiry> & { unread: number }>("/enquiries?filter=unread&limit=1").then(
      (page) => live && setUnread(page.unread),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [pathname, setUnread]);

  const moreActive = MORE.some((item) => isActive(pathname, item.href));

  return (
    <div className="adm">
      <aside className="a-side">
        <Link href="/admin" className="a-side__logo" aria-label="Overview">
          <Logo />
        </Link>
        <nav className="a-side__nav" aria-label="Dashboard">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cx("a-nav", isActive(pathname, href) && "is-active")} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon />
              <span>{label}</span>
              {href === "/admin/enquiries" && unread > 0 && <span className="a-nav__count">{unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="a-side__foot">
          <a href="/" target="_blank" rel="noopener noreferrer" className="a-nav">
            <IconExternal />
            <span>View site</span>
          </a>
          <div className="a-side__user">
            <span className="a-side__email" title={me.user.email}>
              {me.user.name || me.user.email}
            </span>
            <button type="button" className="a-nav a-nav--button" onClick={() => void signOut()}>
              <IconLogout />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <header className="a-topbar">
        <Link href="/admin" aria-label="Overview">
          <Logo className="a-topbar__logo" />
        </Link>
      </header>

      <main className="a-main">{children}</main>

      <nav className="a-tabs" aria-label="Dashboard">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cx("a-tab", isActive(pathname, href) && "is-active")} aria-current={isActive(pathname, href) ? "page" : undefined}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
        <button type="button" className={cx("a-tab", moreActive && "is-active")} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <span className="a-tab__icon">
            <IconMore />
            {unread > 0 && <span className="a-tab__dot" aria-label={`${unread} unread`} />}
          </span>
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <Sheet title="More" variant="side" onClose={() => setMoreOpen(false)}>
          <nav className="a-more" aria-label="More">
            {MORE.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cx("a-more__item", isActive(pathname, href) && "is-active")} onClick={() => setMoreOpen(false)}>
                <Icon />
                <span>{label}</span>
                {href === "/admin/enquiries" && unread > 0 && <span className="a-nav__count">{unread}</span>}
              </Link>
            ))}
            <a href="/" target="_blank" rel="noopener noreferrer" className="a-more__item">
              <IconExternal />
              <span>View site</span>
            </a>
            <button type="button" className="a-more__item" onClick={() => void signOut()}>
              <IconLogout />
              <span>Sign out</span>
            </button>
          </nav>
        </Sheet>
      )}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider>
        <Frame>{children}</Frame>
      </SessionProvider>
    </ToastProvider>
  );
}
