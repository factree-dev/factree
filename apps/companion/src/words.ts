// The words the stages use, in one place (spec codebase-health R2), so the line, the list and the stage pages agree.

export const STALE = "Stale · spec changed";
export const UP_NEXT = "Up next";
/** A stage's status before any work on it; the current stage reads "Up next" instead (stage-spine R5). */
export const NOT_STARTED = new Set(["No plan yet", "Not started", "Not verified", "No pull request yet"]);
export const PLAN_LABEL = { draft: "Draft", "design-approved": "Design approved", approved: "Approved" } as const;
const REVIEW_LABEL: Record<string, string> = { OPEN: "Waiting for reviewers", CONFLICTING: "Conflicts with the base", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved", MERGED: "Merged", CLOSED: "Closed" };
export const reviewLabel = (state: string) => REVIEW_LABEL[state] ?? REVIEW_LABEL.OPEN!;
/** A vertical's name for display: "backend" reads "Backend"; "general" reads "General". */
export const verticalLabel = (v: string) => (v ? v[0]!.toUpperCase() + v.slice(1) : v);
