import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountActions } from "@/lib/nocturne/account";

/** Log in or create an account. Shown whenever a shared action needs a signed-in person. */
export function AuthPanel({ intro }: { intro?: string | undefined }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [adult, setAdult] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const registering = mode === "register";
  const ready = registering
    ? name.trim() && email.trim() && password.length >= 10 && adult
    : email.trim() && password;

  async function submit() {
    setError("");
    setBusy(true);
    const result = registering
      ? await accountActions.register(name.trim(), email.trim(), password)
      : await accountActions.login(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setPassword("");
  }

  return (
    <section aria-labelledby="auth-heading">
      <div className="mb-6 grid grid-cols-2 gap-2">
        <Button
          variant={registering ? "outline" : "default"}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          Log in
        </Button>
        <Button
          variant={registering ? "default" : "outline"}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          Create account
        </Button>
      </div>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ready && !busy) await submit();
        }}
      >
        <h2 id="auth-heading" className="text-2xl">
          {registering ? "Create your account" : "Welcome back"}
        </h2>
        {intro && <p className="text-sm text-gold">{intro}</p>}
        {registering && (
          <div className="space-y-2">
            <Label htmlFor="account-name">Your name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="account-email">Email</Label>
          <Input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-password">Password</Label>
          <Input
            id="account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={200}
            autoComplete={registering ? "new-password" : "current-password"}
            required
          />
          {registering && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
        </div>
        {registering && (
          <label className="flex items-start gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
            />
            I am 18+ and participate voluntarily. Either person can pause or stop.
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button size="lg" className="w-full" disabled={!ready || busy} type="submit">
          {busy ? "Please wait…" : registering ? "Create account" : "Log in"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          {registering
            ? "Spaces you already opened on this browser move into your new account."
            : "Signing in on this browser also moves any spaces you opened here before accounts existed."}{" "}
          Password reset by email isn't available yet, so keep your password safe.
        </p>
      </form>
    </section>
  );
}
