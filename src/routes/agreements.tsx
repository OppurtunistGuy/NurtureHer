import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne, useSpaceConnection } from "@/lib/nocturne/store";
import { useUnsavedChanges } from "@/lib/nocturne/unsaved";
import { AGREEMENT_MARKDOWN, AGREEMENT_MAX_LENGTH } from "@/lib/nocturne/agreement-document";

export const Route = createFileRoute("/agreements")({
  head: () => ({
    meta: [
      { title: "Master & Sub Agreement — BoundSome" },
      {
        name: "description",
        content: "Our agreed structure, boundaries, safety signals, privacy and review.",
      },
    ],
  }),
  component: AgreementsPage,
});
const SECTIONS = ["Agreement text", "Boundaries", "Excluded activities", "Communication windows"];

function AgreementsPage() {
  const s = useNocturne(),
    a = s.agreement,
    me = s.viewRole;
  const written = !!a.document?.markdown.trim();
  const [section, setSection] = useState("Agreement text"),
    [text, setText] = useState("");
  useUnsavedChanges(!!text.trim(), "an agreement proposal");
  const sections =
    a.document?.markdown
      .split(/^### /m)
      .slice(1)
      .map((part) => ({
        title: part.slice(0, part.indexOf("\n")).trim(),
        body: part.slice(part.indexOf("\n")).trim(),
      })) ?? [];
  const intro =
    a.document?.markdown
      .split(/^### /m)[0]
      ?.split("\n")
      .filter((line) => !line.startsWith("#") && line.trim())
      .join("\n\n") ??
    "Your current terms remain in place until discussion and mutual readiness allow the pending agreement update.";
  return (
    <AppShell eyebrow="Our shared understanding" title="BoundSome">
      <h2 className="text-2xl">Master &amp; Sub Agreement</h2>
      {!written && me === "sub" && (
        <p role="status" className="my-5 rounded-md border border-gold/40 p-4 text-sm">
          {s.names.dom} hasn't written your agreement yet. Once it's ready you'll read it here and
          both acknowledge it. You can suggest what it should say below.
        </p>
      )}
      {me === "dom" && <AgreementEditor />}
      {s.agreementUpdatePending && (
        <p role="status" className="my-5 rounded-md border border-gold/40 p-4 text-sm">
          Your supplied agreement is waiting to be installed. The dynamic is paused; finish the
          discussion and resume together before the terms change. Both will then need to acknowledge
          the new agreement.
        </p>
      )}
      <div className="my-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-destructive/50 p-3">
          <p className="font-semibold text-destructive">RED</p>
          <p className="mt-1 text-xs text-muted-foreground">Stop the activity immediately.</p>
        </div>
        <div className="rounded-md border border-gold/50 p-3">
          <p className="font-semibold text-gold">YELLOW</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pause and check in before proceeding.
          </p>
        </div>
      </div>
      <p className="text-sm leading-7 text-muted-foreground">{intro}</p>
      <div className="mt-7" aria-label="Agreement text">
        {sections.length ? (
          sections.map((part, index) => (
            <details key={part.title} open={index === 0} className="border-b py-5">
              <summary className="cursor-pointer font-display text-2xl text-ivory">
                {part.title}
              </summary>
              <div className="mt-5 space-y-4">
                <AgreementText text={part.body} />
              </div>
            </details>
          ))
        ) : (
          <>
            <List title="Current boundaries" items={a.boundaries} />
            <List title="Current excluded activities" items={a.excluded} />
          </>
        )}
      </div>
      <section className="mt-8 border-y py-6">
        <h2 className="text-2xl">Acknowledgement</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {s.names.dom} (Master): {a.ack.dom ? "✓ acknowledged" : "pending"} · {s.names.sub} (Sub):{" "}
          {a.ack.sub ? "✓ acknowledged" : "pending"}
        </p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Acknowledge only after reading the terms. You retain your right to pause or withdraw
          consent. Changes require fresh acknowledgements.
        </p>
        <Button
          className="mt-4"
          disabled={!!a.ack[me] || !written}
          onClick={async () => {
            if ((await actions.acknowledgeAgreement()).ok) toast.success("Agreement acknowledged");
          }}
        >
          {a.ack[me]
            ? "You've acknowledged"
            : written
              ? "I acknowledge this agreement"
              : "Waiting for the agreement to be written"}
        </Button>
        {a.document && (
          <p className="mt-3 text-xs text-muted-foreground">
            Agreement version: {a.document.version} · Review date {a.lastReview}
          </p>
        )}
      </section>
      <details className="mt-6 border-b pb-6">
        <summary className="cursor-pointer font-display text-2xl">
          Working limits &amp; additional terms
        </summary>
        <div className="mt-5 space-y-5">
          <List title="Hard limits" items={a.excluded} />
          <List title="Boundaries" items={a.boundaries} />
          <div>
            <h3 className="text-xl">Communication windows</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {a.commWindows || "None agreed yet."}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{a.emergencyContact}</p>
        </div>
      </details>
      <section className="mt-7">
        <h2 className="text-2xl">Propose an addition</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Either person may propose. The other person reviews it. An accepted change to the text is
          added to the agreement, and both acknowledge it again.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SECTIONS.map((x) => (
            <Button
              key={x}
              size="sm"
              variant={section === x ? "secondary" : "outline"}
              onClick={() => setSection(x)}
            >
              {x === "Excluded activities"
                ? "Hard limit"
                : x === "Agreement text"
                  ? "Change to the text"
                  : x}
            </Button>
          ))}
        </div>
        <Textarea
          className="mt-3"
          aria-label="Proposal"
          placeholder={
            section === "Communication windows"
              ? "Proposed communication window"
              : section === "Agreement text"
                ? "What should the agreement say? For example: one check-in call every Sunday."
                : "Proposed additional term"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
        />
        <Button
          className="mt-3"
          disabled={!text.trim()}
          onClick={async () => {
            if ((await actions.propose(section, text.trim())).ok) {
              setText("");
              toast.success("Proposal sent");
            }
          }}
        >
          Propose
        </Button>
        <ul className="mt-5 space-y-3">
          {a.proposals.map((p) => (
            <li key={p.id} className="surface p-4">
              <p className="eyebrow">
                {p.section} · {s.names[p.by]} · {p.status}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.text}</p>
              {p.status === "open" && p.by !== me && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => actions.resolveProposal(p.id, true)}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.resolveProposal(p.id, false)}
                  >
                    Decline
                  </Button>
                </div>
              )}
              {p.status === "open" && p.by === me && (
                <p className="mt-2 text-xs text-muted-foreground">Waiting for the other person.</p>
              )}
            </li>
          ))}
        </ul>
      </section>
      {!!a.history?.length && (
        <details className="mt-8 border-t pt-6">
          <summary className="cursor-pointer font-display text-2xl">Previous agreements</summary>
          <p className="mt-3 text-xs text-muted-foreground">
            Archived for reference. Previous acknowledgements do not apply to the current agreement.
          </p>
          {a.history.map((old) => (
            <details
              key={`${old.version}-${old.archivedAt}`}
              className="mt-4 rounded-md border p-4"
            >
              <summary className="cursor-pointer text-sm">
                {old.version} · replaced {new Date(old.archivedAt).toLocaleDateString()}
              </summary>
              <div className="mt-4 space-y-4">
                {old.document ? (
                  <AgreementText text={old.document.markdown} />
                ) : (
                  <>
                    <List title="Previous boundaries" items={old.boundaries} />
                    <List title="Previous exclusions" items={old.excluded} />
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Previous safety word: {old.safeword}
                </p>
                <p className="text-xs text-muted-foreground">{old.commWindows}</p>
              </div>
            </details>
          ))}
        </details>
      )}
    </AppShell>
  );
}
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ivory">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
function AgreementText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((block, i) => {
          if (block === "---") return <hr key={i} />;
          if (block.startsWith("- "))
            return (
              <ul
                key={i}
                className="list-disc space-y-3 pl-5 text-sm leading-7 text-muted-foreground"
              >
                {block.split("\n").map((line, j) => (
                  <li key={j}>
                    <Inline text={line.replace(/^- /, "")} />
                  </li>
                ))}
              </ul>
            );
          return (
            <p key={i} className="text-sm leading-7 text-muted-foreground">
              <Inline text={block.replace(/^#{1,3} /, "")} />
            </p>
          );
        })}
    </>
  );
}
function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xl">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          None written yet. Add yours with a proposal below; it applies once you both accept.
        </p>
      ) : (
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Master writes the agreement in their own words. Optional starting points: a short template
 * for beginners, or a copy of their agreement with another Sub. Saving asks both to acknowledge.
 */
function AgreementEditor() {
  const s = useNocturne(),
    connection = useSpaceConnection();
  const current = s.agreement.document?.markdown ?? "";
  const [draft, setDraft] = useState(current),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [copyFrom, setCopyFrom] = useState("");
  useEffect(() => setDraft(current), [current]);
  const changed = draft.trim() !== current.trim();
  useUnsavedChanges(changed, "the agreement you're writing");
  const others = connection.spaces.filter(
    (space) => space.role === "dom" && space.id !== s.space.id,
  );
  async function copy(spaceId: string) {
    setCopyFrom(spaceId);
    try {
      const response = await fetch(`/api/space?space=${encodeURIComponent(spaceId)}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      const text = data?.state?.agreement?.document?.markdown ?? "";
      if (!response.ok || !text.trim()) {
        toast.error("That agreement is empty or couldn't be opened.");
        return;
      }
      setDraft(text);
      toast.success("Copied. Edit it for this Sub, then save.");
    } catch {
      toast.error("Couldn't open that agreement. Check your connection.");
    } finally {
      setCopyFrom("");
    }
  }
  const paused = s.pause.active;
  return (
    <section
      aria-label="Edit the agreement"
      className="my-5 rounded-md border border-gold/40 bg-gold/5 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl text-ivory">You can edit this agreement</h3>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            Only you, as the Master, can change it. Saving shares it with {s.names.sub}, who reads
            it and acknowledges or proposes a change. Routines start once you both acknowledge.
          </p>
          {paused && (
            <p className="mt-1 text-xs text-gold">
              The space is paused. Editing unlocks after you both resume.
            </p>
          )}
        </div>
        {!open && (
          <Button type="button" disabled={paused} onClick={() => setOpen(true)}>
            Edit agreement
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-6 text-muted-foreground">
            Write it in your own words: your rules, limits and expectations. Start a line with
            &quot;### &quot; for a section heading and &quot;- &quot; for a point.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(AGREEMENT_MARKDOWN);
                toast("Standard agreement added. Make it yours, then save.");
              }}
            >
              Start again from the standard agreement
            </Button>
            {others.map((space) => (
              <Button
                key={space.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={!!copyFrom}
                onClick={() => copy(space.id)}
              >
                {copyFrom === space.id ? "Copying…" : `Copy my agreement with ${space.partnerName}`}
              </Button>
            ))}
          </div>
          <Textarea
            aria-label="Write your agreement"
            value={draft}
            maxLength={AGREEMENT_MAX_LENGTH}
            rows={14}
            placeholder="For example: ### Our rules"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!changed || !draft.trim() || busy}
              onClick={async () => {
                setBusy(true);
                const result = await actions.writeAgreement(draft);
                setBusy(false);
                if (result.ok) toast.success("Agreement saved. Both of you acknowledge it below.");
              }}
            >
              {busy ? "Saving…" : `Save and share with ${s.names.sub}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(current);
                setOpen(false);
              }}
            >
              {changed ? "Discard changes" : "Close"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {draft.length.toLocaleString()} / {AGREEMENT_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
