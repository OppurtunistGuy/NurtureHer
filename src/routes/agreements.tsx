import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";

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
const SECTIONS = ["Boundaries", "Excluded activities", "Communication windows"];

function AgreementsPage() {
  const s = useNocturne(),
    a = s.agreement,
    me = s.viewRole;
  const [section, setSection] = useState("Boundaries"),
    [text, setText] = useState("");
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
      {a.document && (
        <p className="mb-6 border-l-2 border-wine pl-4 text-sm leading-6 text-muted-foreground">
          Until December 16: focus on agreed sessions around exams and family commitments. Review
          the arrangement afterward. The app does not automatically expand its scope on that date.
        </p>
      )}
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
          disabled={!!a.ack[me]}
          onClick={async () => {
            if ((await actions.acknowledgeAgreement()).ok) toast.success("Agreement acknowledged");
          }}
        >
          {a.ack[me] ? "You've acknowledged" : "I acknowledge this agreement"}
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
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{a.commWindows}</p>
          </div>
          <p className="text-xs text-muted-foreground">{a.emergencyContact}</p>
        </div>
      </details>
      <section className="mt-7">
        <h2 className="text-2xl">Propose an addition</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Either person may propose. The other person reviews it. Accepted additions require both
          acknowledgements and are recorded separately from the supplied wording.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SECTIONS.map((x) => (
            <Button
              key={x}
              size="sm"
              variant={section === x ? "secondary" : "outline"}
              onClick={() => setSection(x)}
            >
              {x === "Excluded activities" ? "Additional limit" : x}
            </Button>
          ))}
        </div>
        <Textarea
          className="mt-3"
          aria-label="Proposal"
          placeholder={
            section === "Communication windows"
              ? "Proposed communication window"
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
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
