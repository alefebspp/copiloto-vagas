// Fixed catalog so statistics compare like with like (ADR-003).
// OTHER covers what the catalog does not, and always comes with a note.
export const STAGE_TYPES = [
  "APPLIED",
  "HR_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "TAKE_HOME",
  "LIVE_CODING",
  "SYSTEM_DESIGN",
  "MANAGER_INTERVIEW",
  "OFFER",
  "OTHER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type StageType = (typeof STAGE_TYPES)[number];

export const CLOSING_STAGES: ReadonlySet<StageType> = new Set(["HIRED", "REJECTED", "WITHDRAWN"]);

// Not a stage the user picks: it is recorded by reopen().
export type EventType = StageType | "REOPENED";
