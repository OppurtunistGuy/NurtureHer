import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  actions,
  spaceActions,
  useNocturne,
  useSpaceConnection,
  restoreSharedSpace,
} from "@/lib/nocturne/store";
import { invitationToken } from "@/lib/nocturne/space-protocol";
import { loadAccount, useAccount } from "@/lib/nocturne/account";
import { AuthPanel } from "@/components/nocturne/AuthPanel";
import type { Role } from "@/lib/nocturne/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Create or join a space — BoundSome" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const s = useNocturne(),
    connection = useSpaceConnection(),
    navigate = useNavigate(),
    location = useLocation(),
    me = useAccount();
  const fromLink = new URLSearchParams(location.hash.replace(/^#/, "")).get("invite") ?? "";
  // URL fragments never reach SSR. Hydrate the same first frame on both sides,
  // then open the invite after mounting instead of mismatching the server HTML.
  const [mode, setMode] = useState<"create" | "join" | "demo">("create");
  const [name, setName] = useState(""),
    [role, setRole] = useState<Role>("dom"),
    [adult, setAdult] = useState(false);
  const [inviteText, setInviteText] = useState(""),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<{ creatorName: string; role: Role } | null>(null),
    [checking, setChecking] = useState(false);
  const token = invitationToken(inviteText);
  const needsAccount = mode !== "demo" && me.status !== "signedIn";
  useEffect(() => {
    if (me.account?.name) setName((current) => current || me.account!.name);
  }, [me.account]);
  useEffect(() => {
    if (fromLink) {
      setInviteText(fromLink);
      setMode("join");
    }
  }, [fromLink]);
  // Set once this page has finished its job, so redirects never race the navigation away.
  const leaving = useRef(false);
  useEffect(() => {
    // The page can still be mounted for a moment after navigating away; never redirect then.
    if (leaving.current || location.pathname !== "/") return;
    if (fromLink || location.hash === "setup" || mode === "join" || mode === "demo") return;
    // Signed-in people start on their dashboard; the solo demo keeps its own Today page.
    if (me.status === "signedIn") void navigate({ to: "/dashboard", replace: true });
    else if (s.onboarded && s.space.mode !== "shared")
      void navigate({ to: "/today", replace: true });
  }, [
    s.onboarded,
    s.space.mode,
    me.status,
    fromLink,
    location.hash,
    location.pathname,
    mode,
    navigate,
  ]);
  useEffect(() => {
    if (mode !== "join" || !token) return;
    let active = true;
    setChecking(true);
    setError("");
    setPreview(null);
    void spaceActions
      .preview(token)
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to open invitation. Please retry.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [token, mode]);
  async function finish() {
    setError("");
    if (!adult || !name.trim()) return;
    if (mode === "demo") {
      if (actions.onboard(role, name.trim(), role === "dom" ? "Sub" : "Master").ok) {
        leaving.current = true;
        await navigate({ to: "/today" });
      }
      return;
    }
    if (mode === "join" && !token) {
      setError("Paste the complete invitation link you received.");
      return;
    }
    const result =
      mode === "join"
        ? await spaceActions.join(name.trim(), token)
        : await spaceActions.create(name.trim(), role);
    if (result.ok) {
      leaving.current = true;
      if (fromLink) window.history.replaceState(window.history.state, "", "/");
      await navigate({ to: "/today", replace: true });
    } else setError(result.error);
  }
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <p className="eyebrow text-center">A space for two</p>
        <h1 className="mt-4">
          <img
            src="/branding/boundsome-logo.webp"
            alt="BoundSome"
            width="1774"
            height="887"
            className="mx-auto h-auto w-full rounded-lg"
          />
        </h1>
        <p className="my-6 text-center text-sm leading-6 text-muted-foreground">
          Create your space. Share a link. Join each other.
        </p>
        {s.space.mode === "shared" && (
          <p className="mb-4 rounded-md border p-3 text-sm">
            Each relationship has its own private space.{" "}
            <button className="underline" onClick={() => navigate({ to: "/today" })}>
              Open your space
            </button>
            . Create or join another below. A different person must redeem your own invitation.
          </p>
        )}
        {needsAccount ? (
          me.status === "checking" ? (
            <p role="status" className="text-center text-sm text-muted-foreground">
              Checking your account…
            </p>
          ) : me.status === "offline" ? (
            <div role="alert" className="text-sm text-destructive">
              <p>Cannot reach BoundSome right now. Nothing has been changed.</p>
              <button type="button" className="mt-2 underline" onClick={() => loadAccount()}>
                Retry
              </button>
            </div>
          ) : (
            <AuthPanel
              intro={
                mode === "join" && preview
                  ? `${preview.creatorName} invited you to join as ${preview.role === "dom" ? "Master" : "Sub"}. Log in or create an account to accept.`
                  : mode === "join" && error
                    ? error
                    : undefined
              }
            />
          )
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-2">
              <Button
                variant={mode === "create" ? "default" : "outline"}
                onClick={() => {
                  setMode("create");
                  setError("");
                }}
              >
                Create a space
              </Button>
              <Button
                variant={mode === "join" ? "default" : "outline"}
                onClick={() => {
                  setMode("join");
                  setError("");
                }}
              >
                Join a space
              </Button>
            </div>
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                await finish();
              }}
            >
              <h2 className="text-2xl">
                {mode === "join"
                  ? "Join your partner"
                  : mode === "demo"
                    ? "Try it on your own"
                    : "Your space starts here"}
              </h2>
              {mode === "join" && (
                <div className="space-y-2">
                  <Label htmlFor="invite-link">Invitation link</Label>
                  <Input
                    id="invite-link"
                    value={inviteText}
                    onChange={(e) => {
                      setInviteText(e.target.value);
                      setPreview(null);
                      setError("");
                    }}
                    placeholder="Paste the link you received"
                    autoComplete="off"
                  />
                  {checking && (
                    <p role="status" className="text-xs text-muted-foreground">
                      Opening invitation…
                    </p>
                  )}
                  {preview && (
                    <p className="text-sm text-gold">
                      {preview.creatorName} invited you to join as{" "}
                      {preview.role === "dom" ? "Master" : "Sub"}.
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  required
                  autoComplete="nickname"
                />
              </div>
              {mode !== "join" && (
                <div>
                  <p className="mb-2 text-sm">Your role</p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Role">
                    {(["dom", "sub"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={role === value}
                        onClick={() => setRole(value)}
                        className={`surface p-4 text-left ${role === value ? "border-wine bg-wine-soft/40" : ""}`}
                      >
                        <span className="font-display text-xl">
                          {value === "dom" ? "Master" : "Sub"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={adult}
                  onChange={(e) => setAdult(e.target.checked)}
                />
                I am 18+ and participate voluntarily. Either person can pause or stop.
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {connection.status === "offline" && !error && mode !== "demo" && (
                <div className="text-sm text-destructive">
                  <p>{connection.error}</p>
                  <button
                    type="button"
                    className="mt-2 underline"
                    onClick={() => restoreSharedSpace()}
                  >
                    Retry connection
                  </button>
                </div>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={
                  !adult ||
                  !name.trim() ||
                  connection.busy ||
                  checking ||
                  (mode === "join" && (!token || !preview))
                }
                type="submit"
              >
                {connection.busy
                  ? "Saving…"
                  : mode === "join"
                    ? "Join space"
                    : mode === "demo"
                      ? "Enter solo demo"
                      : "Create my space"}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                {mode === "demo"
                  ? "A local demo with example routines. Switch perspectives in Settings to test alone; it does not connect another person."
                  : "You are signed in, so this space follows your account to any device. Use example data while testing."}
              </p>
            </form>
          </>
        )}
        {mode !== "demo" && !s.onboarded && (
          <button
            className="mt-6 text-sm text-muted-foreground underline"
            onClick={() => {
              setMode("demo");
              setError("");
            }}
          >
            Try alone first
          </button>
        )}
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        Product Under Thinkable &amp; Co ❤️
      </footer>
    </div>
  );
}
