import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarClock,
  History,
  MessageSquare,
  Settings,
  Sun,
  Target,
  Inbox,
  ClipboardCheck,
  MoreHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNocturne, useSpaceConnection, restoreSharedSpace } from "@/lib/nocturne/store";
import { PauseBanner, PauseButton } from "./PauseControl";
import { useReminders } from "./useReminders";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/routines", label: "Routines", icon: CalendarClock },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/proof", label: "Proof review", icon: ClipboardCheck },
  { to: "/requests", label: "Requests", icon: Inbox },
  { to: "/notes", label: "Notes", icon: MessageSquare },
  { to: "/agreements", label: "Agreement", icon: BookOpen },
  { to: "/activity", label: "Activity", icon: History },
] as const;
const MOBILE = [NAV[0], NAV[1], NAV[3], NAV[4]] as const;

export function AppShell({
  title,
  eyebrow,
  children,
  allowDuringPause = false,
  readControls,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  allowDuringPause?: boolean;
  readControls?: ReactNode;
}) {
  const s = useNocturne(),
    connection = useSpaceConnection(),
    { pathname } = useLocation();
  useReminders();
  if (!s.onboarded)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-4xl">Nocturne Together</h1>
        <p className="text-sm text-muted-foreground">
          {connection.status === "checking"
            ? "Opening your space…"
            : "Create a space or join with an invitation."}
        </p>
        <Link to="/" className="rounded-md bg-primary px-5 py-2.5 text-primary-foreground">
          Begin
        </Link>
      </div>
    );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/today" className="font-display text-2xl tracking-wide text-ivory">
            <span className="block leading-none">Nocturne</span>
            <span className="mt-1 block font-sans text-[0.55rem] uppercase tracking-[0.3em] text-gold">
              Together
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-gold sm:inline">
              {s.viewRole === "dom" ? "Master" : "Sub"} perspective
            </span>
            <PauseButton compact />
            <Link
              to="/settings"
              aria-label="Settings"
              className="rounded-md p-2 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <nav
          className="mx-auto hidden max-w-3xl items-center justify-between gap-1 overflow-x-auto px-3 pb-3 md:flex"
          aria-label="Main"
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="whitespace-nowrap rounded-md px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
              activeProps={{ className: "bg-secondary text-ivory" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t bg-wine-soft/20">
          <p className="mx-auto max-w-3xl px-4 py-2 text-[0.68rem] text-muted-foreground">
            {s.space.mode === "shared" ? (
              <>
                <span className="text-gold">Shared space</span> ·{" "}
                {connection.busy
                  ? "Saving…"
                  : connection.status === "offline"
                    ? "Connection unavailable"
                    : s.space.paired
                      ? "Connected"
                      : "Waiting for your partner"}{" "}
                · use example data while testing
              </>
            ) : (
              <>
                <span className="text-gold">Solo demo</span> · stored on this browser · use example
                data only
              </>
            )}
          </p>
        </div>
      </header>
      <PauseBanner />
      {s.space.mode === "shared" && connection.error && (
        <div role="alert" className="mx-auto mt-4 w-full max-w-3xl rounded-md border p-4 text-sm">
          <p>{connection.error}</p>
          <button className="mt-2 underline" onClick={() => restoreSharedSpace()}>
            Refresh connection
          </button>
        </div>
      )}
      {s.storageWarning && (
        <p
          role="alert"
          className="mx-auto mt-4 w-full max-w-3xl rounded-md border border-warning/40 p-4 text-sm text-warning"
        >
          {s.storageWarning}
        </p>
      )}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-8 md:pb-12">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-4xl text-ivory md:text-5xl">{title}</h1>
        <div className="ornament my-6 text-[0.6rem]" aria-hidden>
          ◆
        </div>
        {readControls && <div className="mb-6">{readControls}</div>}
        <fieldset
          disabled={
            (s.pause.active && !allowDuringPause) ||
            connection.busy ||
            (s.space.mode === "shared" && connection.status === "offline")
          }
          className="min-w-0 border-0 p-0"
        >
          {children}
        </fieldset>
      </main>
      <footer className="hidden pb-6 text-center text-xs text-muted-foreground md:block">
        Product Under Thinkable &amp; Co ❤️
      </footer>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        <ul className="grid grid-cols-5">
          {MOBILE.map((n) => {
            const Icon = n.icon;
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  aria-current={pathname === n.to ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-3 text-[0.65rem] ${pathname === n.to ? "text-gold" : "text-muted-foreground"}`}
                >
                  <Icon className="h-5 w-5" />
                  {n.label === "Proof review" ? "Review" : n.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex h-auto w-full flex-col gap-1 rounded-none py-3 text-[0.65rem] text-muted-foreground"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  More
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle>Explore your space</SheetTitle>
                </SheetHeader>
                <nav className="mt-5 grid grid-cols-2 gap-2" aria-label="More pages">
                  {NAV.filter((n) => !MOBILE.some((m) => m.to === n.to)).map((n) => (
                    <SheetClose asChild key={n.to}>
                      <Link to={n.to} className="rounded-md border px-4 py-3 text-sm">
                        {n.label}
                      </Link>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <Link to="/settings" className="rounded-md border px-4 py-3 text-sm">
                      {s.space.mode === "demo" ? "Settings & demo roles" : "Settings"}
                    </Link>
                  </SheetClose>
                </nav>
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </div>
  );
}
