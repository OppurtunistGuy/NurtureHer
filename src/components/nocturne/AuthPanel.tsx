import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountActions } from "@/lib/nocturne/account";

/** Log in or create an account. Shown whenever a shared action needs a signed-in person. */
export function AuthPanel({ intro }: { intro?: string | undefined }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [resetToken, setResetToken] = useState(""),
    [notice, setNotice] = useState("");
  // The emailed link carries its one-time token after the #, so it never reaches a server log.
  // Also listens for hash changes, so a link opened in a tab already on this page still works.
  useEffect(() => {
    const read = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("reset") ?? "";
      if (/^[a-f0-9]{64}$/.test(token)) {
        setResetToken(token);
        setMode("reset");
        setError("");
        setNotice("");
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [adult, setAdult] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const registering = mode === "register";
  const forgetting = mode === "forgot",
    resetting = mode === "reset";
  const ready = resetting
    ? password.length >= 10
    : forgetting
      ? email.trim()
      : registering
        ? name.trim() && email.trim() && password.length >= 10 && adult
        : email.trim() && password;

  async function submit() {
    setError("");
    setNotice("");
    setBusy(true);
    if (forgetting) {
      const sent = await accountActions.forgot(email.trim());
      setBusy(false);
      if (!sent.ok) setError(sent.error);
      else setNotice(sent.message ?? "If that email has an account, a reset link is on its way.");
      return;
    }
    if (resetting) {
      const done = await accountActions.reset(resetToken, password);
      setBusy(false);
      if (!done.ok) return setError(done.error);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setResetToken("");
      setPassword("");
      setMode("login");
      setNotice("Password changed. Log in with your new password.");
      return;
    }
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
            setNotice("");
          }}
        >
          Log in
        </Button>
        <Button
          variant={registering ? "default" : "outline"}
          onClick={() => {
            setMode("register");
            setError("");
            setNotice("");
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
          {resetting
            ? "Choose a new password"
            : forgetting
              ? "Reset your password"
              : registering
                ? "Create your account"
                : "Welcome back"}
        </h2>
        {forgetting && (
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send a link that works for 30 minutes.
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-gold">
            {notice}
          </p>
        )}
        {intro && !resetting && !forgetting && <p className="text-sm text-gold">{intro}</p>}
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
        {!resetting && (
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
        )}
        {!forgetting && (
          <div className="space-y-2">
            <Label htmlFor="account-password">{resetting ? "New password" : "Password"}</Label>
            <Input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={200}
              autoComplete={registering || resetting ? "new-password" : "current-password"}
              required
            />
            {(registering || resetting) && (
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-xs text-gold underline underline-offset-2"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setNotice("");
                }}
              >
                Forgot your password?
              </button>
            )}
          </div>
        )}
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
          {busy
            ? "Please wait…"
            : resetting
              ? "Save new password"
              : forgetting
                ? "Send reset link"
                : registering
                  ? "Create account"
                  : "Log in"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          {resetting || forgetting
            ? "For your safety, resetting signs you out on every device."
            : registering
              ? "Spaces you already opened on this browser move into your new account."
              : "Signing in on this browser also moves any spaces you opened here before accounts existed."}
        </p>
      </form>
    </section>
  );
}
