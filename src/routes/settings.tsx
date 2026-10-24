import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { RoleSwitch } from "@/components/nocturne/RoleSwitch";
import { SpaceConnection } from "@/components/nocturne/SpaceConnection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — BoundSome" }] }),
  component: SettingsPage,
});
function SettingsPage() {
  const s = useNocturne(),
    navigate = useNavigate();
  return (
    <AppShell eyebrow="Device preferences & demo tools" title="Settings" allowDuringPause>
      <SpaceConnection settings />
      {s.space.mode === "demo" && (
        <section className="space-y-3">
          <h2 className="text-2xl">Demo perspective</h2>
          <p className="text-xs leading-6 text-muted-foreground">
            One person can explore both roles here—even during a pause to test discussion. This
            changes the preview only, not your account. There is no authenticated partner. Real
            production roles must come from server-side identity.
          </p>
          <RoleSwitch />
          <Link to="/" hash="setup" className="inline-block text-sm text-gold underline">
            Create or join a shared space
          </Link>
        </section>
      )}
      <fieldset disabled={s.pause.active} className="mt-10 space-y-9">
        <section className="space-y-4">
          <h2 className="text-2xl">Reminders</h2>
          <label className="flex items-center justify-between text-sm">
            In-app reminders
            <Switch
              checked={s.prefs.inAppReminders}
              onCheckedChange={(v) => actions.setPrefs({ inAppReminders: v })}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quiet-start">Quiet from</Label>
              <Input
                id="quiet-start"
                className="mt-2"
                type="time"
                value={s.prefs.quietStart}
                onChange={(e) => {
                  if (e.target.value) actions.setPrefs({ quietStart: e.target.value });
                }}
              />
            </div>
            <div>
              <Label htmlFor="quiet-end">Quiet until</Label>
              <Input
                id="quiet-end"
                className="mt-2"
                type="time"
                value={s.prefs.quietEnd}
                onChange={(e) => {
                  if (e.target.value) actions.setPrefs({ quietEnd: e.target.value });
                }}
              />
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Only while this app is open. No push notifications. Silent during a pause and quiet
            hours.
          </p>
        </section>
        {s.space.mode === "demo" && (
          <section className="space-y-3">
            <h2 className="text-2xl">Try connecting</h2>
            <p className="text-xs text-muted-foreground">
              The solo demo has no partner. Create a shared space to get a real invitation link.
            </p>
          </section>
        )}
        {s.space.mode === "demo" && (
          <section className="space-y-3">
            <h2 className="text-2xl">Data</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              Names, messages, submissions and history are stored as unencrypted browser data.
              Clearing browser data removes the demo. No cloud backup or encryption is provided.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Clear demo data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all demo data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Routines, goals, notes and history in this browser will be replaced with a fresh
                    demo. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      if ((await actions.reset()).ok) {
                        navigate({ to: "/" });
                        toast("Demo cleared");
                      }
                    }}
                  >
                    Clear all demo data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        )}
      </fieldset>
      <section className="mt-10 border-t pt-6">
        <h2 className="text-2xl">Capability boundaries</h2>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          <li>Text check-ins and manual review: available.</li>
          <li>Neutral one-time prompts: demo only; not identity or liveness verification.</li>
          <li>Camera, media storage, encryption and screenshot protection: not implemented.</li>
          <li>
            {s.space.mode === "shared"
              ? "Roles and pause rules: checked by the server using this browser's session. No signup or account recovery yet."
              : "Roles and pause rules: enforced locally in the solo demo."}
          </li>
          {s.space.mode === "shared" && (
            <li>
              Shared records are stored on the app server, without end-to-end encryption. Keep this
              browser session to return.
            </li>
          )}
        </ul>
      </section>
    </AppShell>
  );
}
