import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountMenu } from "@/components/nocturne/AppShell";
import { AuthPanel } from "@/components/nocturne/AuthPanel";
import { useAccount } from "@/lib/nocturne/account";
import { spaceActions, useSpaceConnection } from "@/lib/nocturne/store";
import { invitationLink } from "@/lib/nocturne/space-protocol";
import { matchesFilter, type DashboardCard, type DashboardFilter } from "@/lib/nocturne/dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "All Subs — BoundSome" }, { name: "referrer", content: "no-referrer" }],
  }),
  component: Dashboard,
});

const FILTERS: { value: DashboardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "Pending review" },
  { value: "paused", label: "Paused" },
  { value: "agreement", label: "Agreement not acknowledged" },
  { value: "waiting", label: "Waiting to join" },
];

/** A Master opens the Sub's profile; a Sub opens their own pages for that relationship. */
const openRelationship = async (
  navigate: ReturnType<typeof useNavigate>,
  card: Pick<DashboardCard, "id" | "myRole">,
) => {
  if (card.myRole === "dom") {
    await navigate({
      to: "/subs/$spaceId/$section",
      params: { spaceId: card.id, section: "overview" },
    });
    return;
  }
  const result = await spaceActions.open(card.id);
  if (result.ok) await navigate({ to: "/today" });
};

function Dashboard() {
  const me = useAccount(),
    connection = useSpaceConnection(),
    navigate = useNavigate();
  const [cards, setCards] = useState<DashboardCard[] | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<DashboardFilter>("all"),
    [inviting, setInviting] = useState(false),
    [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/space?dashboard=1", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load your dashboard.");
      setCards(data.cards);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your dashboard.");
    }
  }, []);
  useEffect(() => {
    if (me.status !== "signedIn") return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [me.status, load]);

  async function inviteSub() {
    if (!me.account) return;
    setInviting(true);
    const result = await spaceActions.create(me.account.name, "dom");
    setInviting(false);
    if (result.ok) {
      toast.success("Invitation ready. Copy the link from the new card.");
      await load();
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (cards ?? []).filter(
      (card) =>
        matchesFilter(card, filter) && (!needle || card.partnerName.toLowerCase().includes(needle)),
    );
  }, [cards, query, filter]);
  const subs = visible.filter((card) => card.myRole === "dom"),
    masters = visible.filter((card) => card.myRole === "sub");
  const hasMasters = (cards ?? []).some((card) => card.myRole === "sub"),
    hasSubs = (cards ?? []).some((card) => card.myRole === "dom");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" aria-label="BoundSome dashboard" className="shrink-0">
            <img
              src="/branding/boundsome-logo.webp"
              alt="BoundSome"
              width="144"
              height="72"
              className="h-auto w-36 rounded-md"
            />
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8">
        {me.status === "checking" && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking your account…
          </p>
        )}
        {(me.status === "signedOut" || me.status === "offline") && (
          <div className="mx-auto max-w-md">
            <AuthPanel intro="Log in to open your dashboard." />
          </div>
        )}
        {me.status === "signedIn" && (
          <>
            <p className="eyebrow">Dashboard</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-4xl text-ivory md:text-5xl">
                {hasMasters && !hasSubs ? "My Masters" : "All Subs"}
              </h1>
              {cards && cards.length > 0 && hasSubs && (
                <Button onClick={inviteSub} disabled={inviting || connection.busy}>
                  {inviting ? "Creating invitation…" : "Invite a Sub"}
                </Button>
              )}
            </div>
            <div className="ornament my-6 text-[0.6rem]" aria-hidden>
              ◆
            </div>
            {error && (
              <div role="alert" className="mb-6 rounded-md border p-4 text-sm">
                <p>{error}</p>
                <button className="mt-2 underline" onClick={() => load()}>
                  Retry
                </button>
              </div>
            )}
            {cards === null && !error && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading your relationships…
              </p>
            )}
            {cards && cards.length === 0 && (
              <section
                className="surface space-y-4 p-6 text-center"
                aria-labelledby="empty-heading"
              >
                <h2 id="empty-heading" className="text-2xl">
                  No Subs yet
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Invite someone you have agreed to do this with. They get a private link, create
                  their own account and choose to accept. Each relationship stays separate.
                </p>
                <Button size="lg" onClick={inviteSub} disabled={inviting || connection.busy}>
                  {inviting ? "Creating invitation…" : "Invite your first Sub"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Joining someone as their Sub instead?{" "}
                  <Link to="/" hash="setup" className="text-gold underline">
                    Open their invitation or create another way
                  </Link>
                </p>
              </section>
            )}
            {cards && cards.length > 0 && (
              <>
                <div className="mb-6 space-y-3">
                  <Label htmlFor="search-subs" className="sr-only">
                    Search by name
                  </Label>
                  <Input
                    id="search-subs"
                    placeholder="Search by name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div
                    role="group"
                    aria-label="Filter relationships"
                    className="flex flex-wrap gap-2"
                  >
                    {FILTERS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={filter === item.value}
                        onClick={() => setFilter(item.value)}
                        className={`rounded-full border px-3 py-1 text-xs ${filter === item.value ? "border-wine bg-wine-soft/40 text-ivory" : "text-muted-foreground"}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                {visible.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nobody matches this search or filter.
                  </p>
                )}
                {subs.length > 0 && (
                  <Group title={hasMasters ? "My Subs" : undefined}>
                    {subs.map((card) => (
                      <Card key={card.id} card={card} origin={origin} navigate={navigate} />
                    ))}
                  </Group>
                )}
                {masters.length > 0 && (
                  <Group title={hasSubs ? "My Masters" : undefined}>
                    {masters.map((card) => (
                      <Card key={card.id} card={card} origin={origin} navigate={navigate} />
                    ))}
                  </Group>
                )}
                <p className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  {!hasSubs && (
                    <button
                      type="button"
                      className="text-gold underline"
                      disabled={inviting || connection.busy}
                      onClick={inviteSub}
                    >
                      Invite a Sub of your own
                    </button>
                  )}
                  <Link to="/" hash="setup" className="text-gold underline">
                    Join someone else&apos;s space or create one as Sub
                  </Link>
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Group({ title, children }: { title?: string | undefined; children: React.ReactNode }) {
  return (
    <section className="mb-8" aria-label={title ?? "Relationships"}>
      {title && <h2 className="mb-3 text-2xl">{title}</h2>}
      <ul className="grid gap-4 sm:grid-cols-2">{children}</ul>
    </section>
  );
}

function Card({
  card,
  origin,
  navigate,
}: {
  card: DashboardCard;
  origin: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const link = card.invite && origin ? invitationLink(origin, card.invite.token) : "";
  const name = card.paired ? card.partnerName : "Invitation not used yet";
  return (
    <li className="surface flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-soft/50 font-display text-lg text-ivory"
          >
            {card.paired ? card.partnerName.slice(0, 1).toUpperCase() : "?"}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg text-ivory">{name}</h3>
            <p className="text-xs text-muted-foreground">
              {card.myRole === "dom" ? "Your Sub" : "Your Master"} · {card.level}
            </p>
          </div>
        </div>
        <Status card={card} />
      </div>
      {card.paired ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Stat
            label="Today"
            value={`${card.today.completed} done · ${card.today.pending} pending`}
          />
          <Stat
            label={card.myRole === "dom" ? "To review" : "Waiting for review"}
            value={String(card.pendingReview)}
            highlight={card.pendingReview > 0}
          />
          <Stat label="Reward points" value={String(card.rewards)} />
          <Stat
            label="Punishment points"
            value={String(card.outstandingPunishment)}
            highlight={card.outstandingPunishment > 0}
          />
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Latest check-in</dt>
            <dd>
              {card.latestCheckIn
                ? `${card.latestCheckIn.title} · ${new Date(card.latestCheckIn.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                : "None yet"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Agreement</dt>
            <dd>
              {card.agreement === "acknowledged"
                ? "Acknowledged by both"
                : card.agreement === "update-pending"
                  ? "Update waiting for acknowledgement"
                  : "Not yet acknowledged by both"}
            </dd>
          </div>
        </dl>
      ) : link ? (
        <div className="space-y-2">
          <Label htmlFor={`invite-${card.id}`}>Invitation link</Label>
          <Input
            id={`invite-${card.id}`}
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            One person can join. Expires {new Date(card.invite!.expiresAt).toLocaleDateString()}.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Invitation link copied");
              } catch {
                toast("Select the link and copy it manually.");
              }
            }}
          >
            Copy invitation link
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Waiting for the other person to join.</p>
      )}
      <Button
        className="mt-auto w-full"
        variant={card.paired ? "default" : "outline"}
        aria-label={card.paired ? `Open ${card.partnerName}` : "Open this waiting space"}
        onClick={() => openRelationship(navigate, card)}
      >
        {card.paired ? `Open ${card.partnerName}` : "Open space"}
      </Button>
    </li>
  );
}

function Status({ card }: { card: DashboardCard }) {
  const [text, tone] = card.paused
    ? [
        card.pauseSignal ? `Paused · ${card.pauseSignal}` : "Paused",
        "border-destructive/60 text-destructive",
      ]
    : !card.paired
      ? ["Waiting to join", "text-muted-foreground"]
      : card.pendingReview > 0
        ? [card.myRole === "dom" ? "Review waiting" : "Sent for review", "border-gold/60 text-gold"]
        : ["Active", "text-muted-foreground"];
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] ${tone}`}>
      {text}
    </span>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={highlight ? "text-gold" : ""}>{value}</dd>
    </div>
  );
}
