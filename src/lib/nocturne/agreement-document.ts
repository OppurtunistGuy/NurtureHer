import type { Agreement, AppState } from "./types";
import { dateKey } from "./logic";

/**
 * The founders' own agreement, supplied verbatim. Spaces that already have it keep it exactly,
 * acknowledgements included; it is never installed in a new space.
 */
export const PERSONAL_AGREEMENT_VERSION = "master-sub-2026-10-23-v1";

// User-supplied wording. Keep this verbatim; negotiated additions are separate.
export const PERSONAL_AGREEMENT_MARKDOWN = `# BoundSome

## Master & Sub Agreement

This agreement defines the structure, expectations, rules, accountability, and responsibilities of our BDSM dynamic. The goal is to maintain discipline, trust, consistency, privacy, and clear communication.

### 1. Dynamic & Authority

- The Master leads the dynamic and establishes its rules, routines, tasks, and expectations.
- The Sub is expected to follow instructions consistently, respect established rules, and communicate honestly.
- Until December 16, the dynamic will focus on agreed BDSM sessions due to exams and family commitments. The arrangement can be reviewed afterward.
- Established rules remain active until the Master approves a change. Safety concerns, hard limits, and withdrawal of consent must always be respected.

### 2. Kinks & Limits

- The Sub is interested in exploring BDSM, pain, tension, pleasure, self-control, discipline, and other mutually agreed activities.
- **Hard limits:** Anal play, tasting or ingesting semen, and panties-in-mouth nasty activities.
- New activities must be discussed before introduction. Interest in BDSM does not automatically mean consent to every activity.
- The Master is responsible for respecting stated limits and taking appropriate safety precautions.

### 3. Rules & Obedience

- Rules and tasks must be followed as instructed and within the agreed dynamic.
- Deliberately ignoring, breaking, or disregarding a clearly understood rule is considered a violation.
- The Sub must communicate promptly if illness, an emergency, exams, or another genuine difficulty affects a task.
- If an instruction is unclear or a task cannot reasonably be completed, the Sub must communicate rather than silently ignoring it.
- Requests to change established routines should be discussed with the Master. Safety concerns and withdrawal of consent take immediate priority.

### 4. Rule Violations, Punishments & Consequences

**First violation — Warning**

- The Master identifies the broken rule and explains the concern.
- The Sub is expected to acknowledge the mistake, explain the circumstances honestly, and understand what needs to change.
- A warning is an opportunity to correct the behaviour, not permission to repeat it.

**Repeated violations — Stronger consequences**

- Repeated violations, continued neglect, dishonesty, or failure to correct behaviour after a warning will be taken seriously.
- The Master may choose an appropriate consequence based on the seriousness, frequency, intent, and circumstances of the violation.
- Consequences may include a written reflection, accountability report, corrective task, review of responsibilities, or temporary restriction of an agreed optional privilege.
- The Master is not required to use the same consequence for every violation.

**Frequent or deliberate disobedience — Serious disciplinary action**

- If rule-breaking becomes frequent, deliberate, or continues despite warnings and previous consequences, it will be treated as a serious breach of the dynamic.
- The Master may determine that an ordinary warning is insufficient and select a stronger disciplinary response from the agreed consequences.
- The Master may consider the overall pattern of behaviour, rather than treating every incident as an isolated mistake.
- The Sub is expected to take responsibility, demonstrate genuine correction, and rebuild trust through consistent actions.

**The Master’s discretion**

- The Master has discretion to assess violations and choose an appropriate response within the agreed limits of the dynamic.
- The response may become more serious when behaviour is repeated, deliberate, dishonest, or left uncorrected.
- No consequence is automatic simply because a task was missed; relevant circumstances should be considered.
- Physical punishment and new BDSM activities require separate agreement. Neither this agreement nor a rule violation grants unlimited authority to introduce an unagreed activity.

**Exceptions and safety**

- Illness, emergencies, genuine inability, and misunderstandings must be communicated and assessed fairly.
- Deliberately hiding a violation or being dishonest about task completion may be treated as a separate accountability issue.
- Using a safeword, requesting a safety pause, refusing an activity outside agreed limits, or withdrawing consent is not disobedience and must never be punished.

**Core expectation:** The Master leads and applies accountability consistently. The Sub is expected to follow established rules, communicate honestly, and correct repeated mistakes. Frequent or deliberate rule-breaking will be treated more seriously than an isolated, genuine mistake.

### 5. Consent & Safety

- Both parties must communicate honestly about discomfort, uncertainty, and boundaries.
- **RED:** Stop the activity immediately.
- **YELLOW:** Pause and check in before proceeding.
- Either person may pause or stop an activity when necessary.
- Appropriate check-ins and aftercare will be provided.
- Authority does not override consent, hard limits, or immediate safety needs.

### 6. Privacy & Trust

- Private conversations and media will be handled carefully and not intentionally shared outside the agreed private space.
- Tasks requiring proof must specify what type of proof is acceptable.
- Intimate photos and videos must not be compulsory proof of obedience. An alternative must be available.
- Family members and friends will not be involved in the private dynamic without mutual agreement.
- Both parties understand that no app, chat, or storage method can guarantee absolute confidentiality.

### 7. Communication & Review

- The Sub is expected to communicate honestly about tasks, difficulties, boundaries, and concerns.
- The Master is expected to give clear instructions and apply rules consistently.
- Both parties will review the arrangement when necessary, particularly after December 16.
- Changes to activities, limits, or physical consequences must be discussed and agreed upon before implementation.

---

### Final Understanding

**The Master leads. The Sub follows established rules and takes responsibility for her commitments.**

Rules, discipline, and consequences are intended to build consistency, trust, and accountability. The Master has discretion to manage the dynamic and respond to repeated violations, while both parties remain responsible for maintaining safety, respecting hard limits, and communicating honestly.

This agreement is a shared understanding of the dynamic, not a waiver of either person's right to stop or withdraw consent.`;

/** An agreement the Master wrote (or copied, or started from the template) in the app. */
export const CUSTOM_AGREEMENT_VERSION = "custom";
export const AGREEMENT_MAX_LENGTH = 20000;

/** An optional short starting point for beginners. Never installed unless the Master picks it. */
export const AGREEMENT_VERSION = "boundsome-template-2026-11-01-v1";
export const AGREEMENT_MARKDOWN = `# BoundSome

## Master & Sub Agreement

This agreement sets out how we use BoundSome together. We are both consenting adults. Either of us can pause or stop at any time, and nothing here overrides that.

### 1. Roles

- The Master leads: sets routines, rules and expectations, and gives clear instructions.
- The Sub follows the agreed routines and rules, and communicates honestly.
- We review how it is going together, regularly.

### 2. Limits

- Hard limits are never crossed. We list ours under "Excluded activities" below and can add to them at any time.
- Interest in one activity is not consent to another. Anything new is discussed and agreed first.
- Limits can change; a change is agreed before it takes effect.

### 3. Routines & check-ins

- Each routine has clear instructions, a time window and what counts as a check-in.
- If something gets in the way (illness, an emergency, a genuine difficulty), the Sub says so instead of ignoring the task.
- If an instruction is unclear, the Sub asks.

### 4. Rewards & consequences

- Rewards and consequences are agreed in advance, per routine.
- No consequence is automatic: the circumstances are considered first.
- Consequences stay within our agreed limits. Intimate photos or videos are never required as proof.
- Using a safeword, pausing, refusing something outside our limits, or withdrawing consent is never punished.

### 5. Consent & safety

- **RED:** stop immediately.
- **YELLOW:** slow down and check in.
- Either of us can pause the space. We resume only after we have both talked and both agree.
- Authority never overrides consent, hard limits or safety.

### 6. Privacy

- What we share here stays between us. We don't share screenshots or details without the other's agreement.
- No app or storage can promise absolute confidentiality.

### 7. Review

- Either of us can propose a change to this agreement in the app; it applies once we both accept it.

---

This agreement is a shared understanding between us, not a waiver of either person's right to stop or withdraw consent.`;

export function createAgreement(today: string): Agreement {
  return {
    // Empty until the Master writes it: the app doesn't decide anyone's dynamic.
    document: { version: CUSTOM_AGREEMENT_VERSION, markdown: "" },
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
  // A couple's agreement is theirs: the app never replaces it, whatever its version.
  // Only the legacy product heading is renamed, which is not a change to agreed terms.
  if (document) {
    const renamed = document.markdown.replace(/^# NOCTURNE TOGETHER(?=\r?\n)/, "# BoundSome");
    return renamed === document.markdown
      ? state
      : {
          ...state,
          agreement: { ...state.agreement, document: { ...document, markdown: renamed } },
        };
  }
  // Very old spaces without an agreement document: archive their terms and start an empty
  // agreement for the Master to write.
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
        text: "Started a new agreement for the Master to write. Previous terms archived; both acknowledge it once it is written.",
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
