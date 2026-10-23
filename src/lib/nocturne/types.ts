export type Role = "dom" | "sub";

export type TaskStatus =
  | "pending"
  | "submitted"
  | "revision"
  | "completed"
  | "clarification"
  | "extension"
  | "excused"
  | "skipped"
  | "paused";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  submitted: "Awaiting review",
  revision: "Needs another check-in",
  completed: "Completed",
  clarification: "Needs clarification",
  extension: "Extension requested",
  excused: "Excused",
  skipped: "Skipped by agreement",
  paused: "Paused",
};

export type Recurrence =
  { kind: "daily" } | { kind: "weekdays"; days: number[] } | { kind: "once"; date: string };

export interface Routine {
  id: string;
  title: string;
  instructions: string;
  windowStart: string; // HH:mm
  windowEnd: string; // HH:mm
  dueTime?: string;
  recurrence: Recurrence;
  reminderMinutes: number | null;
  enabled: boolean;
  requiresAck: boolean;
  optInDaily: boolean;
  proof?: "confirmation" | "text" | "challenge";
  revision?: number;
}

export interface TaskRecord {
  status: TaskStatus;
  note?: string;
  optedIn?: boolean;
  acknowledged?: boolean;
  updatedAt: string;
  by: Role;
  dueTimeOverride?: string;
  routineRevision?: number;
}

export type RequestKind = "illness" | "extension" | "permission" | "routine_change" | "skip";
export type RequestReason = "health" | "emergency" | "study_work" | "sleep" | "other" | "";

export interface PartnerRequest {
  id: string;
  kind: RequestKind;
  routineId?: string;
  date: string;
  reason: RequestReason;
  returnAt?: string;
  note: string;
  by: Role;
  at: string;
  status: "open" | "accepted" | "declined";
  response?: string;
}

export interface Proposal {
  id: string;
  by: Role;
  section: string;
  text: string;
  at: string;
  status: "open" | "accepted" | "declined";
}

export interface Agreement {
  document?: { version: string; markdown: string };
  history?: AgreementArchive[];
  checkInSignal?: string;
  boundaries: string[];
  excluded: string[];
  commWindows: string;
  safeword: string;
  emergencyContact: string;
  lastReview: string;
  ack: Record<Role, string | null>;
  proposals: Proposal[];
}

export interface AgreementArchive {
  version: string;
  archivedAt: string;
  document?: { version: string; markdown: string };
  boundaries: string[];
  excluded: string[];
  commWindows: string;
  safeword: string;
  emergencyContact: string;
  lastReview: string;
  ack: Record<Role, string | null>;
  proposals: Proposal[];
}

export interface PauseState {
  active: boolean;
  by?: Role;
  at?: string;
  reason?: string;
  signal?: "RED" | "YELLOW";
  resumeAck: Record<Role, boolean>;
  sessionId?: string;
}

export interface Message {
  id: string;
  by: Role;
  text: string;
  at: string;
  routineId?: string;
  channel?: "notes" | "discussion";
  pauseSession?: string;
}

export interface Goal {
  id: string;
  title: string;
  instructions: string;
  criteria: string;
  dueDate: string;
  category: "personal" | "wellbeing" | "work" | "relationship";
  status: "active" | "completed" | "archived";
}

export interface Submission {
  id: string;
  routineId: string;
  routineTitle: string;
  instructions: string;
  routineRevision: number;
  date: string;
  text: string;
  proof: "confirmation" | "text" | "challenge";
  at: string;
  status: "open" | "accepted" | "revision" | "rejected";
  response?: string;
  reviewedAt?: string;
  challengePrompt?: string;
}

export interface Challenge {
  id: string;
  routineId: string;
  date: string;
  prompt: string;
  expiresAt: number;
}

export interface Activity {
  id: string;
  at: string;
  by: Role | "system";
  text: string;
}

export interface Prefs {
  inAppReminders: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface AppState {
  version: 1 | 2;
  onboarded: boolean;
  myRole: Role;
  viewRole: Role;
  names: Record<Role, string>;
  space: {
    inviteCode: string;
    paired: boolean;
    mode: "demo" | "shared";
    id?: string;
    timeZone?: string;
  };
  routines: Routine[];
  tasks: Record<string, TaskRecord>;
  requests: PartnerRequest[];
  agreement: Agreement;
  pause: PauseState;
  messages: Message[];
  activity: Activity[];
  prefs: Prefs;
  goals?: Goal[];
  submissions?: Submission[];
  // Ephemeral: never persisted; a neutral prompt, NOT biometric/live verification.
  challenge?: Challenge | undefined;
  storageWarning?: string | undefined;
  agreementUpdatePending?: boolean;
}
