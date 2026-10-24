import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountActions, useAccount } from "@/lib/nocturne/account";
import { useNocturne, useSpaceConnection } from "@/lib/nocturne/store";
import { AuthPanel } from "@/components/nocturne/AuthPanel";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "My account — BoundSome" }] }),
  component: AccountPage,
});

function AccountPage() {
  const me = useAccount(),
    s = useNocturne(),
    connection = useSpaceConnection(),
    navigate = useNavigate();
  const [name, setName] = useState(""),
    [nameMessage, setNameMessage] = useState("");
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [passwordMessage, setPasswordMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me.account) setName(me.account.name);
  }, [me.account]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        <Link to={s.onboarded ? "/today" : "/"} className="text-sm text-gold underline">
          ← Back
        </Link>
        <h1 className="mt-4 text-4xl text-ivory">My account</h1>
        {me.status === "checking" && (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            Checking your account…
          </p>
        )}
        {(me.status === "signedOut" || me.status === "offline") && (
          <div className="mt-8">
            <AuthPanel intro="Log in to manage your account." />
          </div>
        )}
        {me.status === "signedIn" && me.account && (
          <div className="mt-8 space-y-10">
            <section aria-labelledby="signed-in" className="surface p-4">
              <h2 id="signed-in" className="text-sm text-muted-foreground">
                Signed in as
              </h2>
              <p className="mt-1 text-lg text-ivory">{me.account.name}</p>
              <p className="text-sm text-muted-foreground">{me.account.email}</p>
            </section>

            <form
              className="space-y-3"
              aria-labelledby="name-heading"
              onSubmit={async (e) => {
                e.preventDefault();
                setNameMessage("");
                const result = await accountActions.rename(name.trim());
                setNameMessage(result.ok ? "Name saved." : result.error);
              }}
            >
              <h2 id="name-heading" className="text-2xl">
                Display name
              </h2>
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={!name.trim() || name.trim() === me.account.name}>
                Save name
              </Button>
              {nameMessage && (
                <p role="status" className="text-sm text-muted-foreground">
                  {nameMessage}
                </p>
              )}
            </form>

            <form
              className="space-y-3"
              aria-labelledby="password-heading"
              onSubmit={async (e) => {
                e.preventDefault();
                setPasswordMessage("");
                setBusy(true);
                const result = await accountActions.changePassword(current, next);
                setBusy(false);
                if (result.ok) {
                  setCurrent("");
                  setNext("");
                  setPasswordMessage("Password changed. Other devices have been signed out.");
                } else setPasswordMessage(result.error);
              }}
            >
              <h2 id="password-heading" className="text-2xl">
                Password
              </h2>
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
              <Button type="submit" disabled={busy || !current || next.length < 10}>
                {busy ? "Saving…" : "Change password"}
              </Button>
              {passwordMessage && (
                <p role="status" className="text-sm text-muted-foreground">
                  {passwordMessage}
                </p>
              )}
            </form>

            <section aria-labelledby="relationships-heading" className="space-y-3">
              <h2 id="relationships-heading" className="text-2xl">
                Linked relationships
              </h2>
              {connection.spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet.{" "}
                  <Link to="/" hash="setup" className="text-gold underline">
                    Create or join a space
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2">
                  {connection.spaces.map((space) => (
                    <li key={space.id} className="surface flex justify-between p-3 text-sm">
                      <span>{space.partnerName}</span>
                      <span className="text-muted-foreground">
                        You are {space.role === "dom" ? "Master" : "Sub"}
                        {!space.paired ? " · awaiting partner" : ""}
                        {space.paused ? " · paused" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                const result = await accountActions.logout();
                if (result.ok) await navigate({ to: "/", replace: true });
                else setPasswordMessage(result.error);
              }}
            >
              Sign out
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
