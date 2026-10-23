import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actions, useNocturne } from "@/lib/nocturne/store";
import type { Role } from "@/lib/nocturne/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nocturne — begin your private space" },
      {
        name: "description",
        content: "Choose your role and create or join a private, consent-first space for two.",
      },
      { property: "og:title", content: "Nocturne — begin your private space" },
      {
        property: "og:description",
        content: "A private, consent-first routine space for two partners.",
      },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const s = useNocturne();
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [partner, setPartner] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [adult, setAdult] = useState(false);

  useEffect(() => {
    if (s.onboarded) navigate({ to: "/today", replace: true });
  }, [s.onboarded, navigate]);

  function finish() {
    if (mode === "join") {
      setErr("Joining needs the connected backend. In demo mode, create a space instead.");
      return;
    }
    if (!adult || !role) return;
    if (
      actions.onboard(role, name.trim(), partner.trim() || (role === "dom" ? "Sub" : "Master")).ok
    )
      toast.success("Your demo space is ready");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <p className="eyebrow text-center">A private space for two</p>
        <h1 className="mt-2 text-center text-5xl text-ivory">Nocturne Together</h1>
        <div className="ornament my-6 text-[0.6rem]" aria-hidden>
          ◆
        </div>

        {step === 0 && (
          <section className="space-y-6">
            <p className="text-center font-display text-xl italic text-muted-foreground">
              Ritual, structure and care — always on terms you both chose, and always pausable.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>· Either of you can pause at any time, without consequence.</li>
              <li>· No image proof, no tracking, no automated punishment.</li>
              <li>· Health, sleep, work and study always come first.</li>
            </ul>
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
              />
              We are both adults (18+) and participate voluntarily.
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              This is an unencrypted, single-browser demo. Use example names and text, not sensitive
              information.
            </p>
            <Button size="lg" className="w-full" disabled={!adult} onClick={() => setStep(1)}>
              I understand — continue
            </Button>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-2xl">Your role</h2>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Role">
              {(["dom", "sub"] as Role[]).map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={`surface p-5 text-left transition-colors ${role === r ? "border-wine bg-wine-soft/40" : "hover:border-muted-foreground"}`}
                >
                  <span className="font-display text-2xl text-ivory">
                    {r === "dom" ? "Master" : "Sub"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {r === "dom"
                      ? "Assigns goals, sets routines, reviews check-ins."
                      : "Submits progress, asks permission, requests changes."}
                  </span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner">
                {role === "sub" ? "Master's name (optional)" : "Sub's name (optional)"}
              </Label>
              <Input
                id="partner"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                maxLength={40}
              />
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={!role || !name.trim()}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="text-2xl">Your private space</h2>
            <div className="grid grid-cols-2 gap-2">
              {(["create", "join"] as const).map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "default" : "outline"}
                  onClick={() => {
                    setMode(m);
                    setErr("");
                  }}
                >
                  {m === "create" ? "Create" : "Join with code"}
                </Button>
              ))}
            </div>
            {mode === "create" ? (
              <div className="surface p-4">
                <p className="eyebrow">Invite code</p>
                <p className="mt-1 font-mono text-2xl tracking-widest text-ivory">
                  {s.space.inviteCode}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Status: <span className="text-gold">not paired</span>. In demo mode this code
                  can't be redeemed — connecting a backend makes codes one-use and expiring.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="code">Invite code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXXX-XXXXX"
                  aria-invalid={!!err}
                />
              </div>
            )}
            {err && (
              <p className="text-sm text-destructive" role="alert">
                {err}
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              onClick={finish}
              disabled={mode === "join" && code.length < 11}
            >
              {mode === "create" ? "Enter demo space" : "Join space"}
            </Button>
            <button
              className="w-full text-xs text-muted-foreground underline"
              onClick={() => setStep(1)}
            >
              Back
            </button>
          </section>
        )}
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        Product Under Thinkable &amp; Co ❤️
      </footer>
    </div>
  );
}
