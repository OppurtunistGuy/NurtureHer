import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { accountActions, useAccount } from "@/lib/nocturne/account";

/** Feedback goes straight to the BoundSome owner. Only the owner can read it. */
export function FeedbackForm() {
  const me = useAccount();
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  if (me.status !== "signedIn")
    return <p className="text-sm text-muted-foreground">Log in to send feedback.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || text.trim().length < 3) return;
        setBusy(true);
        setError("");
        const result = await accountActions.sendFeedback(text.trim(), window.location.pathname);
        setBusy(false);
        if (!result.ok) return setError(result.error);
        setText("");
        setSent(true);
      }}
    >
      <Label htmlFor="feedback-text">What worked, what didn't, what you'd like next</Label>
      <Textarea
        id="feedback-text"
        value={text}
        maxLength={2000}
        rows={5}
        placeholder="For example: the routine editor was confusing because…"
        onChange={(event) => {
          setText(event.target.value);
          setSent(false);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Only the BoundSome owner reads this. Your partner doesn't see it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="text-sm text-gold">
          Thank you — your feedback was sent.
        </p>
      )}
      <Button type="submit" disabled={busy || text.trim().length < 3}>
        {busy ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
