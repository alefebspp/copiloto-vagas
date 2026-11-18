import { DomainError } from "./domain-error.js";
import { CLOSING_STAGES, type EventType, type StageType } from "./stage.js";

export interface StageEvent {
  readonly id: string;
  readonly type: EventType;
  /** When the stage happened, given by the user. Drives the timeline and statistics. */
  readonly occurredAt: Date;
  /** When it was recorded. Drives closing, reopening and undo. */
  readonly recordedAt: Date;
  readonly note?: string;
}

export interface Job {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly url?: string;
  readonly createdAt: Date;
  /** In recording order. */
  readonly events: readonly StageEvent[];
}

export interface NewJob {
  id: string;
  title: string;
  company: string;
  url?: string;
}

export interface NewStage {
  eventId: string;
  type: StageType;
  occurredAt: Date;
  note?: string;
}

// Time and IDs come from outside so the domain stays deterministic (ADR-002).
export function createJob(input: NewJob, now: Date): Job {
  return { ...input, createdAt: now, events: [] };
}

export function recordStage(job: Job, input: NewStage, now: Date): Job {
  if (isClosed(job)) {
    throw new DomainError("JOB_CLOSED", `Job ${job.id} is closed. Reopen it before recording new stages.`);
  }
  if (input.occurredAt > now) {
    throw new DomainError("FUTURE_DATE", "A stage cannot happen in the future.");
  }
  const note = input.note?.trim();
  if (input.type === "OTHER" && !note) {
    throw new DomainError("NOTE_REQUIRED", "Stages of type OTHER need a note explaining what happened.");
  }

  const event: StageEvent = {
    id: input.eventId,
    type: input.type,
    occurredAt: input.occurredAt,
    recordedAt: now,
    ...(note ? { note } : {}),
  };
  return { ...job, events: [...job.events, event] };
}

export function reopen(job: Job, eventId: string, now: Date): Job {
  if (!isClosed(job)) {
    throw new DomainError("JOB_NOT_CLOSED", `Job ${job.id} is not closed.`);
  }
  const event: StageEvent = { id: eventId, type: "REOPENED", occurredAt: now, recordedAt: now };
  return { ...job, events: [...job.events, event] };
}

// The only exception to append-only: fixes a mistake in the most recent record.
export function undoLastEvent(job: Job): Job {
  if (job.events.length === 0) {
    throw new DomainError("NOTHING_TO_UNDO", `Job ${job.id} has no events to undo.`);
  }
  return { ...job, events: job.events.slice(0, -1) };
}

// Follows recording order, so a late REJECTED with an old date still closes the job.
export function isClosed(job: Job): boolean {
  for (let i = job.events.length - 1; i >= 0; i--) {
    const type = job.events[i]?.type;
    if (type === "REOPENED") return false;
    if (type !== undefined && CLOSING_STAGES.has(type)) return true;
  }
  return false;
}

/** Events in the order they happened, for display and statistics. */
export function timeline(job: Job): StageEvent[] {
  return [...job.events].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() || a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
}
