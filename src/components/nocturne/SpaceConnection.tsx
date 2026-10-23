import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uiActions, spaceActions, useNocturne, useSpaceConnection } from "@/lib/nocturne/store";
import { invitationLink } from "@/lib/nocturne/space-protocol";

export function SpaceConnection({ settings = false }: { settings?: boolean }) {
  const s = useNocturne(),
    connection = useSpaceConnection();
  const [name, setName] = useState(s.names[s.myRole]);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (s.space.mode !== "shared") return null;
  const link = connection.invite && origin ? invitationLink(origin, connection.invite.token) : "";
  return (
    <section className="mb-6 space-y-3 rounded-md border p-4" aria-label="Your shared space">
      <h2 className="text-2xl">{s.space.paired ? "You're connected" : "Your space is ready"}</h2>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {s.space.paired
          ? `${s.names.dom} and ${s.names.sub} share this space.`
          : "Waiting for your partner. You can explore and prepare your space now."}
      </p>
      {!s.space.paired && connection.createdByMe && (
        <>
          {link ? (
            <>
              <Label htmlFor="share-link">Share this invitation</Label>
              <Input
                id="share-link"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                One person can join. Expires{" "}
                {new Date(connection.invite!.expiresAt).toLocaleDateString()}. Anyone with this link
                can take that place.
              </p>
              <Button
                disabled={s.pause.active}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    toast.success("Invitation link copied");
                  } catch {
                    toast("Select the invitation above and copy it manually.");
                  }
                }}
              >
                Copy invitation link
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The invitation has expired. Generate a new link below.
            </p>
          )}
          <Button
            variant="outline"
            disabled={s.pause.active || connection.busy}
            onClick={async () => {
              if ((await uiActions.regenerateInvite()).ok)
                toast("New invitation ready; the previous link no longer works.");
            }}
          >
            Generate new link
          </Button>
          <p className="text-xs text-muted-foreground">
            Testing by yourself? Open the link in a separate browser profile to join as the other
            person.
          </p>
        </>
      )}
      {s.space.paired && (
        <Link to="/agreements" className="inline-block text-sm text-gold underline">
          Review your agreement together
        </Link>
      )}
      {settings && (
        <form
          className="space-y-2 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await spaceActions.rename(name.trim())).ok) toast.success("Your name was updated");
          }}
        >
          <Label htmlFor="profile-name">Your name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
          <Button
            type="submit"
            variant="outline"
            disabled={s.pause.active || connection.busy || !name.trim()}
          >
            Update my name
          </Button>
        </form>
      )}
    </section>
  );
}
