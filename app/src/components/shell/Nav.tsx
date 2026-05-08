"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils/cn";
import { useSession } from "@/lib/session/SessionProvider";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPrefix?: string;
  ownerOnly?: boolean;
}

function Icon({ name }: { name: string }) {
  const common = "h-5 w-5";
  switch (name) {
    case "home":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "jobs":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16v12H4z" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "customers":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "money":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18" />
          <path d="M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6" />
        </svg>
      );
    case "team":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="3.2" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <circle cx="17" cy="10" r="2.6" />
          <path d="M14 20a5 5 0 0 1 8 0" />
        </svg>
      );
    case "settings":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1c.5.5 1.2.6 1.8.3.6-.2 1-.8 1-1.5V3a2 2 0 0 1 4 0v.1c0 .7.4 1.3 1 1.5.6.3 1.3.2 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8c.2.6.8 1 1.5 1H21a2 2 0 0 1 0 4h-.1c-.7 0-1.3.4-1.5 1z" />
        </svg>
      );
    default:
      return null;
  }
}

const ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: <Icon name="home" /> },
  { href: "/jobs", label: "Jobs", icon: <Icon name="jobs" />, matchPrefix: "/jobs" },
  { href: "/customers", label: "Customers", icon: <Icon name="customers" />, matchPrefix: "/customers" },
  { href: "/money", label: "Money", icon: <Icon name="money" />, matchPrefix: "/money" },
  { href: "/team", label: "Team", icon: <Icon name="team" /> },
  { href: "/settings", label: "Settings", icon: <Icon name="settings" /> },
];

function isActive(pathname: string, item: NavItem) {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.href;
}

function visibleItems(role: string | null): NavItem[] {
  if (role === "worker") return ITEMS.filter((i) => ["Home", "Jobs", "Settings"].includes(i.label));
  return ITEMS;
}

export function SideNav() {
  const pathname = usePathname() ?? "/";
  const { role } = useSession();
  const items = visibleItems(role);
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-ink/60 px-3 py-4 lg:block">
      <div className="mb-4 px-2">
        <p className="text-lg font-bold tracking-tight">Clearline</p>
        <p className="text-xs text-text-faint">Run your business</p>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                active ? "bg-surface text-text" : "text-text-dim hover:bg-surface-hover hover:text-text",
              )}
            >
              <span className={cn("transition", active ? "text-brand-accent" : "text-text-faint")}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
              {active && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute inset-y-1 left-0 w-1 rounded-r bg-brand-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomTabs() {
  const pathname = usePathname() ?? "/";
  const { role } = useSession();
  const items = visibleItems(role).filter((i) => i.label !== "Settings"); // settings via header
  return (
    <nav className="sticky bottom-0 z-30 border-t border-line bg-ink/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl items-stretch justify-between">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-brand-accent" : "text-text-dim",
              )}
            >
              <span>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
