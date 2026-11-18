import { describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "./domain-error.js";
import { createJob, isClosed, recordStage, reopen, timeline, undoLastEvent, type Job } from "./job.js";
import type { StageType } from "./stage.js";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));
const NOW = day(18);

function newJob(): Job {
  return createJob({ id: "job-1", title: "Full-Stack Developer", company: "Acme" }, day(1));
}

function record(job: Job, type: StageType, occurredOn: number, note?: string): Job {
  const id = `event-${String(job.events.length + 1)}`;
  return recordStage(job, { eventId: id, type, occurredAt: day(occurredOn), ...(note ? { note } : {}) }, NOW);
}

function expectDomainError(action: () => unknown, code: DomainErrorCode) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected a DomainError with code ${code}`);
}

describe("createJob", () => {
  it("starts open, with no events and the given creation time", () => {
    const job = newJob();

    expect(job.events).toEqual([]);
    expect(job.createdAt).toEqual(day(1));
    expect(isClosed(job)).toBe(false);
  });
});

describe("recordStage", () => {
  it("appends the event with both timestamps", () => {
    const job = record(newJob(), "APPLIED", 2);

    expect(job.events).toEqual([{ id: "event-1", type: "APPLIED", occurredAt: day(2), recordedAt: NOW }]);
  });

  it("accepts any order and repeated stages", () => {
    let job = newJob();
    for (const [type, on] of [
      ["APPLIED", 2],
      ["TECHNICAL_INTERVIEW", 5],
      ["HR_INTERVIEW", 7],
      ["TECHNICAL_INTERVIEW", 9],
    ] as const) {
      job = record(job, type, on);
    }

    expect(job.events.map((event) => event.type)).toEqual([
      "APPLIED",
      "TECHNICAL_INTERVIEW",
      "HR_INTERVIEW",
      "TECHNICAL_INTERVIEW",
    ]);
  });

  it("does not change the original job", () => {
    const original = newJob();
    record(original, "APPLIED", 2);

    expect(original.events).toEqual([]);
  });

  it("accepts a stage that happened in the past and one that happened right now", () => {
    const job = record(record(newJob(), "APPLIED", 1), "HR_INTERVIEW", 18);

    expect(job.events).toHaveLength(2);
  });

  it("rejects a stage in the future", () => {
    expectDomainError(() => record(newJob(), "APPLIED", 19), "FUTURE_DATE");
  });

  it("requires a note for OTHER and stores it trimmed", () => {
    expectDomainError(() => record(newJob(), "OTHER", 2), "NOTE_REQUIRED");
    expectDomainError(() => record(newJob(), "OTHER", 2, "   "), "NOTE_REQUIRED");

    const job = record(newJob(), "OTHER", 2, "  Coffee with the CTO  ");
    expect(job.events[0]?.note).toBe("Coffee with the CTO");
  });

  it.each(["HIRED", "REJECTED", "WITHDRAWN", "NO_RESPONSE"] as const)("refuses new stages after %s", (closing) => {
    const closed = record(record(newJob(), "APPLIED", 2), closing, 3);

    expect(isClosed(closed)).toBe(true);
    expectDomainError(() => record(closed, "HR_INTERVIEW", 4), "JOB_CLOSED");
  });
});

describe("isClosed", () => {
  it("follows recording order: a late REJECTED with an old date still closes the job", () => {
    const job = record(record(newJob(), "TECHNICAL_INTERVIEW", 10), "REJECTED", 5);

    expect(isClosed(job)).toBe(true);
  });
});

describe("reopen", () => {
  it("records a REOPENED event at now and accepts new stages again", () => {
    const closed = record(newJob(), "REJECTED", 3);
    const reopened = reopen(closed, "event-2", NOW);

    expect(reopened.events.at(-1)).toEqual({ id: "event-2", type: "REOPENED", occurredAt: NOW, recordedAt: NOW });
    expect(isClosed(reopened)).toBe(false);
    expect(record(reopened, "HR_INTERVIEW", 18).events).toHaveLength(3);
  });

  it("reopens a job closed by NO_RESPONSE when the company finally answers", () => {
    const silent = record(record(newJob(), "ONLINE_ASSESSMENT", 3), "NO_RESPONSE", 10);
    const answered = record(reopen(silent, "event-3", NOW), "HR_INTERVIEW", 18);

    expect(isClosed(answered)).toBe(false);
    expect(answered.events.map((event) => event.type)).toEqual([
      "ONLINE_ASSESSMENT",
      "NO_RESPONSE",
      "REOPENED",
      "HR_INTERVIEW",
    ]);
  });

  it("refuses to reopen a job that is not closed", () => {
    expectDomainError(() => reopen(newJob(), "event-1", NOW), "JOB_NOT_CLOSED");
  });
});

describe("undoLastEvent", () => {
  it("removes only the most recent record", () => {
    const job = undoLastEvent(record(record(newJob(), "APPLIED", 2), "HR_INTERVIEW", 4));

    expect(job.events.map((event) => event.type)).toEqual(["APPLIED"]);
  });

  it("undoing a reopen closes the job again", () => {
    const reopened = reopen(record(newJob(), "WITHDRAWN", 3), "event-2", NOW);

    expect(isClosed(undoLastEvent(reopened))).toBe(true);
  });

  it("fails when there is nothing to undo", () => {
    expectDomainError(() => undoLastEvent(newJob()), "NOTHING_TO_UNDO");
  });
});

describe("timeline", () => {
  it("sorts by when stages happened, breaking ties by recording time", () => {
    let job = record(newJob(), "TECHNICAL_INTERVIEW", 9);
    job = record(job, "APPLIED", 2);
    job = recordStage(job, { eventId: "event-3", type: "HR_INTERVIEW", occurredAt: day(9) }, day(18));
    job = recordStage(job, { eventId: "event-4", type: "TAKE_HOME", occurredAt: day(9) }, day(17));

    expect(timeline(job).map((event) => event.id)).toEqual(["event-2", "event-4", "event-1", "event-3"]);
  });
});
