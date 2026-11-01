import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountMenu } from "@/components/nocturne/AppShell";
import { AuthPanel } from "@/components/nocturne/AuthPanel";
import { useAccount } from "@/lib/nocturne/account";

export const Route = createFileRoute("/owner")({
  head: () => ({ meta: [{ title: "Owner — BoundSome" }] }),
  component: OwnerPage,
});

type Invite = {
  id: string;
  label: string;
  created: number;
  expires: number;
  status: "valid" | "used" | "expired" | "revoked";
  usedBy: { name: string; email: string } | null;
  usedAt: number | null;
};
type Feedback = {
  id: string;
  text: string;
  page: string | null;
  created: number;
  from: { name: string; email: string };
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/space", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please retry.");
  return data as T;
}
const date = (value: number) =>
  new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function OwnerPage() {
  const me = useAccount();
  const [invites, setInvites] = useState<Invite[] | null>(null),
    [feedback, setFeedback] = useState<Feedback[] | null>(null),
    [label, setLabel] = useState(""),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        call<{ invites: Invite[] }>({ op: "owner.access.list" }),
        call<{ feedback: Feedback[] }>({ op: "owner.feedback.list" }),
      ]);
      setInvites(a.invites);
      setFeedback(b.feedback);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => {
    if (me.status === "signedIn" && me.owner) void load();
  }, [me.status, me.owner, load]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-sm text-gold underline">
            ← Dashboard
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 pb-16 pt-8">
        <div>
          <p className="eyebrow">Owner</p>
          <h1 className="mt-2 text-4xl text-ivory">Invites &amp; feedback</h1>
        </div>
        {me.status === "checking" && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking your account…
          </p>
        )}
        {(me.status === "signedOut" || me.status === "offline") && (
          <div className="max-w-md">
            <AuthPanel intro="Log in with the owner account." />
          </div>
        )}
        {me.status === "signedIn" && !me.owner && (
          <p className="text-sm text-muted-foreground">This page is for the BoundSome owner.</p>
        )}
        {me.status === "signedIn" && me.owner && (
          <>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <section aria-labelledby="new-invite" className="surface space-y-4 p-5">
              <h2 id="new-invite" className="text-2xl">
                New invite link
              </h2>
              <p className="text-sm text-muted-foreground">
                One link per person. It works once and expires after 7 days. Their Sub joins through
                their own invite, so a couple needs only one link from you.
              </p>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!label.trim() || busy) return;
                  setBusy(true);
                  try {
                    const made = await call<{ link: string }>({
                      op: "owner.access.create",
                      label: label.trim(),
                    });
                    setLink(made.link);
                    setLabel("");
                    await load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not create the link.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="min-w-[14rem] flex-1 space-y-2">
                  <Label htmlFor="invite-label">Who is it for?</Label>
                  <Input
                    id="invite-label"
                    value={label}
                    maxLength={60}
                    placeholder="For example: Rahul (tester)"
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={!label.trim() || busy}>
                  {busy ? "Creating…" : "Create invite link"}
                </Button>
              </form>
              {link && (
                <div className="space-y-2 rounded-md border border-gold/40 p-3">
                  <Label htmlFor="new-link">Send this link now — it is shown only once</Label>
                  <Input
                    id="new-link"
                    readOnly
                    value={link}
                    onFocus={(event) => event.target.select()}
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        toast.success("Link copied");
                      } catch {
                        toast.error("Copy failed; select the link and copy it.");
                      }
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              )}
            </section>

            <section aria-labelledby="invite-list" className="space-y-3">
              <h2 id="invite-list" className="text-2xl">
                Invite links
              </h2>
              {invites === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : invites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invite links yet.</p>
              ) : (
                <ul className="space-y-2">
                  {invites.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="text-ivory">{invite.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {invite.status === "used" && invite.usedBy
                            ? `Joined: ${invite.usedBy.name} · ${invite.usedBy.email} · ${date(invite.usedAt ?? invite.created)}`
                            : invite.status === "valid"
                              ? `Not used yet · expires ${date(invite.expires)}`
                              : invite.status === "expired"
                                ? `Expired ${date(invite.expires)}`
                                : "Cancelled"}
                        </p>
                      </div>
                      {invite.status === "valid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await call({ op: "owner.access.revoke", id: invite.id });
                              toast.success("Link cancelled");
                              await load();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Could not cancel.");
                            }
                          }}
                        >
                          Cancel link
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="feedback-list" className="space-y-3">
              <h2 id="feedback-list" className="text-2xl">
                Feedback
              </h2>
              {feedback === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : feedback.length === 0 ? (
                <p className="text-sm text-muted-foreground">No feedback yet.</p>
              ) : (
                <ul className="space-y-2">
                  {feedback.map((item) => (
                    <li key={item.id} className="rounded-md border p-3 text-sm">
                      <p className="whitespace-pre-wrap">{item.text}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.from.name} · {item.from.email} · {date(item.created)}
                        {item.page ? ` · from ${item.page}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
