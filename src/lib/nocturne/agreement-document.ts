import type { Agreement, AppState } from "./types";
import { dateKey } from "./logic";

/**
 * Earlier versions the app installed automatically. A space still on one of these has never had
 * its agreement written or edited in the app, so it is replaced with the standard agreement
 * (previous text archived in History, both acknowledge again). "master-sub-2026-10-23-v1" was the
 * founders' own wording, which was wrongly seeded into new spaces for a while.
 */
export const REPLACED_AGREEMENT_VERSIONS = [
  "master-sub-2026-10-23-v1",
  "boundsome-template-2026-11-01-v1",
] as const;

export const CUSTOM_AGREEMENT_VERSION = "custom";
export const AGREEMENT_MAX_LENGTH = 20000;

/** An optional short starting point for beginners. Never installed unless the Master picks it. */
/** The standard agreement every new space starts with. The Master edits it to fit them. */
export const AGREEMENT_VERSION = "boundsome-standard-2026-11-01-v2";
export const AGREEMENT_MARKDOWN = `# BoundSome

## Master & Sub Agreement

This agreement sets out how we live our Master and Sub dynamic together. We are both consenting adults. Either of us can pause or stop at any time, and nothing here overrides that.

### 1. Roles

- The Master leads: sets routines, rules and expectations, and gives clear instructions.
- The Sub follows the agreed routines and rules willingly, and communicates honestly.
- The Master takes responsibility for the Sub's wellbeing within the dynamic.
- Respect goes both ways, inside and outside the dynamic.
- How the Sub addresses the Master, if at all, is agreed between us.

### 2. Limits

- Hard limits are never crossed. We list ours under "Hard limits" below and can add to them at any time.
- Soft limits are only approached after talking first, slowly, with extra check-ins.
- Interest in one activity is not consent to another. Anything new is discussed and agreed first.
- Nothing new is tried while either of us is unwell, exhausted or not thinking clearly.
- Limits can change; a change is agreed before it takes effect.

### 3. Routines & check-ins

- Each routine has clear instructions, a time window and what counts as a check-in.
- The Sub completes routines on time, or says beforehand if something gets in the way (illness, an emergency, a genuine difficulty).
- If an instruction is unclear, the Sub asks.
- The Master reviews check-ins and gives feedback, not silence.
- Work, studies, health and family come first; routines fit around them.

### 4. Rewards & consequences

- Rewards and consequences are agreed in advance, per routine.
- Rewards recognise effort as well as results.
- No consequence is automatic: the circumstances are considered first.
- Consequences are never given in anger. The Master waits, talks first, then decides.
- Consequences stay within our agreed limits. Intimate photos or videos are never required as proof.
- Using a safeword, pausing, refusing something outside our limits, or withdrawing consent is never punished.

### 5. Consent & safety

- **RED:** stop immediately.
- **YELLOW:** slow down and check in.
- Consent can be withdrawn at any time, for any reason.
- Either of us can pause the space. We resume only after we have both talked and both agree.
- After an intense task or session, we check in and look after each other.
- Authority never overrides consent, hard limits, health or safety.

### 6. Privacy

- What we share here stays between us. We don't share screenshots or details without the other's agreement.
- We never reveal each other's identity or our dynamic to anyone without permission.
- No app or storage can promise absolute confidentiality.

### 7. Review

- We talk honestly about how the dynamic feels, outside our roles, at least once a month.
- Either of us can propose a change to this agreement in the app; it applies once we both accept it.
- Either of us can end the arrangement at any time.

---

This agreement is a shared understanding between us, not a waiver of either person's right to stop or withdraw consent.`;

export function createAgreement(today: string): Agreement {
  return {
    // A standard starting point. The Master edits it; both acknowledge before anything starts.
    document: { version: AGREEMENT_VERSION, markdown: AGREEMENT_MARKDOWN },
    history: [],
    // Each couple writes their own boundaries and hard limits; none are assumed.
    boundaries: [],
    excluded: [],
    commWindows: "",
    safeword: "RED",
    checkInSignal: "YELLOW",
    emergencyContact: "For urgent safety needs, stop and communicate outside the app.",
    lastReview: today,
    ack: { dom: null, sub: null },
    proposals: [],
  };
}

/** Adopt the supplied agreement exactly once. A paused dynamic must discuss and
 * resume before any agreement change; the pending update is applied afterward. */
export function upgradeAgreement(state: AppState, now: Date): AppState {
  const document = state.agreement.document;
  const replace =
    !document ||
    !document.markdown.trim() ||
    (REPLACED_AGREEMENT_VERSIONS as readonly string[]).includes(document.version);
  // An agreement the Master wrote or edited in the app is theirs: never replaced. Only the
  // legacy product heading is renamed, which is not a change to agreed terms.
  if (!replace) {
    const renamed = document.markdown.replace(/^# NOCTURNE TOGETHER(?=\r?\n)/, "# BoundSome");
    return renamed === document.markdown
      ? state
      : {
          ...state,
          agreement: { ...state.agreement, document: { ...document, markdown: renamed } },
        };
  }
  // A blank agreement (from the few hours new spaces started empty) has nothing to archive.
  if (
    document &&
    !document.markdown.trim() &&
    !state.agreement.boundaries.length &&
    !state.agreement.excluded.length
  ) {
    if (state.pause.active) return state;
    return {
      ...state,
      agreement: {
        ...state.agreement,
        document: { version: AGREEMENT_VERSION, markdown: AGREEMENT_MARKDOWN },
        ack: { dom: null, sub: null },
      },
    };
  }
  // Older wording (including the founders' own text, once seeded by mistake): archive it with its
  // lists and acknowledgements, then install the standard agreement. A paused space waits.
  if (state.pause.active) return { ...state, agreementUpdatePending: true };
  const old = state.agreement;
  const current = createAgreement(dateKey(now, state.space.timeZone));
  const previous = {
    version: old.document?.version ?? "previous-template",
    archivedAt: now.toISOString(),
    ...(old.document ? { document: old.document } : {}),
    boundaries: old.boundaries,
    excluded: old.excluded,
    commWindows: old.commWindows,
    safeword: old.safeword,
    emergencyContact: old.emergencyContact,
    lastReview: old.lastReview,
    ack: old.ack,
    proposals: old.proposals,
  };
  return {
    ...state,
    agreementUpdatePending: false,
    challenge: undefined,
    agreement: { ...current, history: [previous, ...(old.history ?? [])] },
    activity: [
      {
        id: `agreement-${AGREEMENT_VERSION}`,
        at: now.toISOString(),
        by: "system" as const,
        text: "Installed the standard agreement. Previous terms archived in History. The Master can edit it; both acknowledge before routines start.",
      },
      ...state.activity,
    ].slice(0, 300),
    names: { dom: oldDefault(state.names.dom, "dom"), sub: oldDefault(state.names.sub, "sub") },
  };
}
function oldDefault(name: string, role: "dom" | "sub") {
  return ["Commander", "Partner", "Dom", "sub"].includes(name)
    ? role === "dom"
      ? "Master"
      : "Sub"
    : name;
}
