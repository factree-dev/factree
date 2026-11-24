// Shapes shared by the server (which reads .factree/) and the browser app.

export type SpecStatus = "draft" | "approved" | "live";

// What the UI shows for a spec: its file status, unless a run is in progress (spec-status R1).
export type DisplayStatus = "needs_you" | "writing" | "draft" | "approved" | "live";

export interface Scope { in: string; out: string; anti: string }   // anti: what would make it a failure (spec-writing R2)

export interface Observation { id: string; text: string }

export interface ScenarioStep { kind: "GIVEN" | "WHEN" | "THEN" | "AND"; text: string }

export interface Scenario { id: string; name: string; steps: ScenarioStep[] }

export interface Requirement {
  id: string;
  name: string;
  statement: string;
  source: string;
  blockedBy: string[];
  scenarios: Scenario[];
}

export interface Decision {
  id: string;
  text: string;          // what was decided, with "because …"
  who: string;
  date: string;
  resolves: string[];
  superseded: boolean;
}

export interface OpenQuestion { id: string; text: string; owner: string; blocks: string[] }

export interface Spec {
  id: string;
  title: string;
  status: SpecStatus;
  owner: string;
  sources: string[];
  approvedBy: string;
  approvedAt: string;
  created: string;
  updated: string;
  purpose: string;
  scope: Scope;
  sketch: string | null;   // the Sketch section's fenced block, exactly as written (spec-writing R1)
  flow: FlowLine[] | null; // the Sketch as a flow block, one step per line (spec-flow R1)
  observations: Observation[];
  requirements: Requirement[];
  code: string[];
  decisions: Decision[];
  questions: OpenQuestion[];
  problems: string[];      // things the parser couldn't read; shown, never hidden
}

export interface FactreeEvent {
  ts: string;
  type: string;
  spec?: string;
  work?: string;
  actor?: string;
  cwd?: string;
  session?: string;   // the Claude Code session that logged it (spec-sessions R1)
  v?: string;         // the Factree version that logged it (version-check R1)
  data: Record<string, unknown>;
}

export type SessionState = "idle" | "working" | "your_turn" | "waiting" | "ended";

export interface Session {
  id: string;
  state: SessionState;
  message: string;
  cwd: string;
  transcript: string;
  started: string;
  updated: string;
}

export type WritingStep = "gaps" | "observe" | "questions" | "writing" | "checking" | "approval";

export interface AskedQuestion { n: number; text: string; why: string; proposal: string; askedAt: string; answer?: string }

// What is happening to a spec right now, worked out from events and sessions.
export interface Live {
  open: boolean;               // a /factree:spec run is in progress for this spec, active or paused
  step: WritingStep | null;
  stepNote: string;
  steps: { step: WritingStep; note: string; at: string }[];
  pendingQuestion: AskedQuestion | null;
  pending: AskedQuestion[];    // every unanswered question of the open run, oldest first (decisions-view R1)
  answered: AskedQuestion[];
  session: Session | null;     // the Claude Code session doing it, if we can tell
  reopened?: boolean;          // the run after the last approval asked a question or updated the spec, so it is a real re-edit (spec-status R1)
}

// What Claude is doing on a spec right now, from the newest progress event (live-activity R1–R3).
export interface Activity { stage: "spec" | "plan" | "build" | "verify" | "review"; label: string; step: string; since: string; paused: boolean; asking: boolean }

export interface SpecSummary {
  id: string;
  title: string;
  status: DisplayStatus;
  lastMoved: string | null;    // time of the spec's latest event
  lastActivity: string | null; // latest event for the spec or its plans, else the file's updated date (spec-order R1)
  activity?: Activity | null;  // what's running now (live-activity R1)
  hasFile: boolean;
  requirements: number;
  scenarios: number;
  openQuestions: number;
  live: Live;
  plan: PlanBrief | null;       // the newest plan for this spec, if any (plan-view R1)
  verify: VerifyCounts | null;  // the latest /factree:verify result (verify R4)
  loop?: LoopState;             // stale stages and rounds when work goes back (spec-ring R4)
}

export interface WaitingItem {
  kind: "question" | "session" | "owned-question";
  spec: string;
  text: string;
  sessionId?: string;
}

// Where code paths in specs link to: `${web}/blob/${ref}/<path>`.
export interface RepoLink { web: string; ref: string }

export interface WorkspaceState {
  workspace: string;
  user: string;
  repo: RepoLink | null;
  specs: SpecSummary[];
  waiting: WaitingItem[];
  serverTime: string;
  versionGap: { running: string; workspace: string } | null;   // this companion is older than the workspace (version-check R3)
  decisions: DecisionCard[];    // every decision waiting on the user, oldest first (companion-decisions R2)
}

export interface SpecDetail {
  summary: SpecSummary;
  spec: Spec | null;
  activity: FactreeEvent[];
  plans: Plan[];                // newest first (plan-view R9)
  sessions: SessionRef[];       // sessions that logged events for this spec, newest first (spec-sessions R2, R4)
  calls: ClaudeCall[];          // decisions Claude made alone, oldest first (decisions-view R1, R3)
  verify: VerifyResult | null;  // the latest /factree:verify result, per scenario (verify R4)
}

// ---------- Plans (spec plan-view; file layout from spec plan-verticals) ----------

// A piece of plan markdown, rendered by the browser with links resolved.
export type Block =
  | { t: "p" | "h"; text: string }
  | { t: "list"; ordered: boolean; items: { text: string; done?: boolean }[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "code"; lang: string; text: string };

export interface PlanSection { name: string; blocks: Block[] }

export interface PlanTask {
  id: string;
  title: string;
  vertical: string;
  proves: string[];              // scenario refs as written, e.g. link-report#R2.S1
  foundation: string | null;     // the reason, for "Proves: none (…)"; "" when none is given
  dependsOn: string[];
  estDiff: string;
  stepsDone: number;
  stepsTotal: number;
  body: PlanSection[];           // Files, Interfaces, Steps…
}

export interface PlanComponent { path: string; serves: string[] }

export interface PlanVertical {
  name: string;
  design: PlanSection[] | null;  // null: no design.md
  tasks: PlanTask[] | null;      // null: no tasks.md
  components: PlanComponent[];
  patterns: string[];
  preamble: string;              // text above the design's first section, e.g. which lens wrote it
}

export type PlanStatus = "draft" | "design-approved" | "approved";

export interface Plan {
  work: string;
  spec: string;
  layout: "vertical" | "old";
  status: PlanStatus;
  designApprovedBy: string;
  designApprovedAt: string;
  approvedBy: string;
  approvedAt: string;
  specUpdated: string;
  scope: string[];
  overview: PlanSection[];
  verticals: PlanVertical[];
  stale: boolean;                // the spec changed after this plan was made (set by the workspace reader)
  sessions: SessionRef[];        // sessions that logged this plan's events, newest first (spec-sessions R3)
  branchReview?: BranchReview | null;   // from agent.started/task.reviewed/task.fixing/branch.reviewed for the branch; null with none
  build: Record<string, TaskBuild>;   // each task's build status, from task.* events (build R8)
  implementedAt: string;         // set by task-done.sh when every task is done (build R6)
  problems: string[];
}

// What the spec list and the Plan stage need: the newest plan, and how many others there are.
export interface PlanBrief { work: string; status: PlanStatus; approvedAt: string; others: number; tasks: number; done: number; implemented: boolean; review?: ReviewInfo | null; branchReview?: BranchReview | null; hold?: Hold }
// A stage the build or review logged as held (stage.held), until stage.released (build-status R4).
export interface Hold { stage: string; reason: string; since: string }
// The newest pull request for a plan, from review.* events (review R8). state: OPEN, CHANGES_REQUESTED, APPROVED, MERGED or CLOSED.
export interface ReviewComment { author: string; path: string; line: string; body: string; handled: string | null }
// One pull request, keyed by repo and number (multi-repo R9); repo "" is the workspace's only repo.
export interface PullRequest { repo: string; number: string; url: string; base: string; tasks: string[]; after: string[]; state: string; comments: ReviewComment[] }
// url, state and comments are the newest pull request's; prs lists every one (oldest first).
export interface ReviewInfo { url: string; state: string; comments: ReviewComment[]; prs?: PullRequest[] }

// A Claude Code session that worked on a spec or plan, and when it last logged an event.
// state: from the hook's session file; "unknown" when there is none, or it's stale (companion-handoff R2).
export interface SessionRef { id: string; last: string; state: "working" | "your_turn" | "waiting" | "ended" | "unknown" }

// A decision Claude made alone and logged as decision.recorded with call: true (decision-flow R3).
export interface ClaudeCall { id: string; text: string; by: string; ts: string; from: string }

export type TaskBuildStatus = "waiting" | "running" | "done" | "failed" | "blocked";
export type TaskPhase = "waiting" | "building" | "reviewing" | "fixing" | "merged";
// phase..reviewerRecorded come from agent.started, task.waiting, task.reviewed and task.fixing (build-visibility R2); findings are the not-beyond-sources ones, suggestions the beyond-sources ones.
export interface TaskBuild {
  status: TaskBuildStatus; commit?: string; lines?: number; reason?: string;
  phase?: TaskPhase; model?: string; round?: number; cause?: string; verdict?: string; findings?: number; suggestions?: number; reviewerRecorded?: boolean;
  history?: TaskHistory[];   // reviews and fix rounds in order (build-status R2)
}
export type TaskHistory = { kind: "review"; verdict: string; findings: number; suggestions: number } | { kind: "fix"; round: number; cause: string };
// The whole-branch review of the plan's latest run (build-visibility R3): probing until branch.reviewed ends it.
export interface BranchReview {
  phase: "probing" | "fixing" | "ended";
  findings: { severity: string; text: string; evidence: string }[];
  notProbed: { area: string; reason: string }[];
  rounds: { round: number; cause: string }[];
  passes: { findings: { severity: string; text: string; evidence: string }[]; fix?: { round: number; cause: string } }[];   // every review pass, with the fix round after it (build-status R3)
  verdict: string; must: number; should: number;
}

export interface VerifyCounts { proved: number; failing: number; unverified: number; manual?: number; at: string }   // manual: unverified because only a person can check them (stage-spine R4)
export type ScenarioStatus = "proved" | "failing" | "unverified";
export interface VerifyResult extends VerifyCounts { results: Record<string, { status: ScenarioStatus; evidence: string }> }


// One decision a spec waits on (companion-decisions R2).
export interface DecisionCard {
  id: string;                                   // q:<spec>:<n> | spec:<spec> | plan:<work> | task:<work>:<T> | lesson:<key>
  kind: "question" | "spec" | "plan" | "task" | "lesson";
  spec: string;
  work?: string;
  n?: number;
  title: string;
  why: string;
  recommendation?: string;
  options: string[];                            // other choices, each "<option> — <what it changes>"
  newPatterns?: { id: string; text: string; href: string }[];
  links: { label: string; href: string }[];
  since: string;
  session: SessionRef | null;
  approvable: boolean;                          // the companion can settle it (R3–R5)
  blockedReason?: string;
  feedback?: string;                            // the latest change request still waiting on Claude (R6)
  lesson?: { key: string; file: string; change: string; evidence: number };   // what a lesson changes, where (self-improving R7)
}

/** One step of a spec's flow: `From -> To : action [R2.S1, R2.S2]` (spec-flow R1). */
export interface FlowLine { from: string; to: string; action: string; cites: string[] }

/** Going back round (spec-ring R4): which of Spec, Plan, Build, Verify, Review are stale, and which round this is. */
export interface LoopState { stale: boolean[]; round: number }
