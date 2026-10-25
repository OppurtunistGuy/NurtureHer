import { Link, useLocation, useNavigate } from "@tanstack/react-router";
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
  Award,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  useNocturne,
  useSpaceConnection,
  restoreSharedSpace,
  spaceActions,
  useGamesEnabled,
} from "@/lib/nocturne/store";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountActions, useAccount } from "@/lib/nocturne/account";
import { SECTIONS, useProfile, type Profile } from "@/lib/nocturne/profile";
import { confirmDiscard } from "@/lib/nocturne/unsaved";
import { toast } from "sonner";

/** Signed-in person, with My account, Dashboard and Sign out. */
export function AccountMenu() {
  const me = useAccount(),
    navigate = useNavigate();
  if (me.status !== "signedIn" || !me.account) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${me.account.name}`}
        className="rounded-md p-2 text-muted-foreground hover:text-foreground"
      >
        <UserRound className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm text-ivory">{me.account.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{me.account.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/account" })}>
          My account
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/dashboard" })}>
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            if (!(await confirmDiscard())) return;
            const result = await accountActions.logout();
            if (result.ok) await navigate({ to: "/", replace: true });
            else toast.error(result.error);
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NAV = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/routines", label: "Routines", icon: CalendarClock },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/points", label: "Points", icon: Award },
  { to: "/proof", label: "Proof review", icon: ClipboardCheck },
  { to: "/requests", label: "Requests", icon: Inbox },
  { to: "/notes", label: "Notes", icon: MessageSquare },
  { to: "/agreements", label: "Agreement", icon: BookOpen },
  { to: "/activity", label: "Activity", icon: History },
] as const;
const GAMES_NAV = { to: "/games", label: "Games" } as const;
const MOBILE = [NAV[0], NAV[1], NAV[4], NAV[5]] as const;

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
    me = useAccount(),
    profile = useProfile(),
    { pathname } = useLocation();
  useReminders();
  const gamesOn = useGamesEnabled(),
    navItems = gamesOn ? [...NAV, GAMES_NAV] : [...NAV];
  if (!s.onboarded)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1>
          <img
            src="/branding/boundsome-logo.webp"
            alt="BoundSome"
            width="240"
            height="120"
            className="h-auto w-60 rounded-md"
          />
        </h1>
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
          <Link
            to={me.status === "signedIn" ? "/dashboard" : "/today"}
            aria-label="BoundSome home"
            className="shrink-0"
          >
            <img
              src="/branding/boundsome-logo.webp"
              alt="BoundSome"
              width="144"
              height="72"
              className="h-auto w-36 rounded-md"
            />
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
            <AccountMenu />
          </div>
        </div>
        {profile && <ProfileBar profile={profile} />}
        {s.space.mode === "shared" && !profile && (
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pb-3">
            <label htmlFor="active-space" className="sr-only">
              Active space
            </label>
            <select
              id="active-space"
              className="native-select min-w-0 flex-1 text-sm"
              value={s.space.id}
              disabled={connection.busy}
              onChange={async (e) => {
                const next = e.target.value;
                // Switching remounts every page, so ask before any unsaved edit is lost.
                if (await confirmDiscard()) void spaceActions.open(next);
                else e.target.value = s.space.id ?? "";
              }}
            >
              {connection.spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.partnerName} · {space.role === "dom" ? "your Sub" : "your Master"}
                  {!space.paired ? " · awaiting partner" : ""}
                  {space.paused ? " · paused" : ""}
                </option>
              ))}
            </select>
            {me.status === "signedIn" ? (
              <Link to="/dashboard" className="shrink-0 text-xs text-gold underline">
                All Subs
              </Link>
            ) : (
              <Link to="/" hash="setup" className="shrink-0 text-xs text-gold underline">
                Add a space
              </Link>
            )}
          </div>
        )}
        <nav
          className={`mx-auto hidden max-w-3xl items-center gap-1 px-3 pb-3 md:flex ${profile ? "flex-wrap" : "justify-between overflow-x-auto"}`}
          aria-label={profile ? `Sections for ${profile.subName}` : "Main"}
        >
          {profile && <ProfileSections profile={profile} />}
          {!profile &&
            navItems.map((n) => (
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
      {s.space.mode === "shared" && me.status === "signedOut" && (
        <div
          role="status"
          className="mx-auto mt-4 w-full max-w-3xl rounded-md border border-gold/40 p-4 text-sm"
        >
          <p>
            You are using this space without an account. It only opens on this browser, for a
            limited time.
          </p>
          <Link to="/" hash="setup" className="mt-2 inline-block text-gold underline">
            Create an account to keep this space
          </Link>
        </div>
      )}
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
            (s.space.mode === "shared" && connection.status === "offline") ||
            (!!profile && s.space.id !== profile.spaceId)
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
        {profile ? (
          <ProfileMobileNav profile={profile} />
        ) : (
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
                    {navItems
                      .filter((n) => !MOBILE.some((m) => m.to === n.to))
                      .map((n) => (
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
        )}
      </nav>
    </div>
  );
}

/** Who is being managed, a switcher between Subs and a way back to All Subs. */
function ProfileBar({ profile }: { profile: Profile }) {
  const connection = useSpaceConnection(),
    navigate = useNavigate();
  const subs = connection.spaces.filter((space) => space.role === "dom");
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 pb-3">
      <Link to="/dashboard" className="shrink-0 text-xs text-gold underline">
        ← All Subs
      </Link>
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wine-soft/50 font-display text-ivory"
      >
        {profile.subName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Managing</p>
        <label htmlFor="profile-selector" className="sr-only">
          Switch Sub
        </label>
        <select
          id="profile-selector"
          className="native-select w-full text-sm"
          value={profile.spaceId}
          disabled={connection.busy}
          onChange={(e) =>
            // Navigation, not sign-in: the router asks before discarding unsaved edits.
            void navigate({
              to: "/subs/$spaceId/$section",
              params: { spaceId: e.target.value, section: profile.section },
            })
          }
        >
          {subs.map((space) => (
            <option key={space.id} value={space.id}>
              {space.paired ? space.partnerName : "Invitation not used yet"}
              {space.paused ? " · paused" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ProfileSections({ profile }: { profile: Profile }) {
  return (
    <>
      {SECTIONS.map((section) => (
        <Link
          key={section.id}
          to="/subs/$spaceId/$section"
          params={{ spaceId: profile.spaceId, section: section.id }}
          aria-current={profile.section === section.id ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-2 py-2 text-xs ${profile.section === section.id ? "bg-secondary text-ivory" : "text-muted-foreground hover:text-foreground"}`}
        >
          {section.label}
        </Link>
      ))}
    </>
  );
}

const MOBILE_SECTIONS = ["overview", "routines", "submissions", "points"] as const;
function ProfileMobileNav({ profile }: { profile: Profile }) {
  const short: Record<string, string> = {
    overview: "Overview",
    routines: "Routines",
    submissions: "Review",
    points: "Points",
  };
  return (
    <ul className="grid grid-cols-5">
      {MOBILE_SECTIONS.map((id) => (
        <li key={id}>
          <Link
            to="/subs/$spaceId/$section"
            params={{ spaceId: profile.spaceId, section: id }}
            aria-current={profile.section === id ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-3 text-[0.65rem] ${profile.section === id ? "text-gold" : "text-muted-foreground"}`}
          >
            {id === "overview" ? (
              <Sun className="h-5 w-5" />
            ) : id === "routines" ? (
              <CalendarClock className="h-5 w-5" />
            ) : id === "submissions" ? (
              <ClipboardCheck className="h-5 w-5" />
            ) : (
              <Award className="h-5 w-5" />
            )}
            {short[id]}
          </Link>
        </li>
      ))}
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
              <SheetTitle>{profile.subName}</SheetTitle>
            </SheetHeader>
            <nav className="mt-5 grid grid-cols-2 gap-2" aria-label="More sections">
              {SECTIONS.filter(
                (section) => !(MOBILE_SECTIONS as readonly string[]).includes(section.id),
              ).map((section) => (
                <SheetClose asChild key={section.id}>
                  <Link
                    to="/subs/$spaceId/$section"
                    params={{ spaceId: profile.spaceId, section: section.id }}
                    className="rounded-md border px-4 py-3 text-sm"
                  >
                    {section.label}
                  </Link>
                </SheetClose>
              ))}
              <SheetClose asChild>
                <Link to="/dashboard" className="rounded-md border px-4 py-3 text-sm">
                  All Subs
                </Link>
              </SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </li>
    </ul>
  );
}
