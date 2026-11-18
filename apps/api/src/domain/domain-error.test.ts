import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error.js";

describe("DomainError", () => {
  it("carries a semantic code and no HTTP status", () => {
    const error = new DomainError("JOB_CLOSED", "job 01J... is closed");

    expect(error.code).toBe("JOB_CLOSED");
    expect(error.message).toBe("job 01J... is closed");
    expect(Object.keys(error)).not.toContain("status");
  });

  it("can be told apart from unexpected errors at the edge", () => {
    const errors: unknown[] = [new DomainError("JOB_NOT_FOUND", "job 01J..."), new Error("timeout")];

    expect(errors.map((error) => error instanceof DomainError)).toEqual([true, false]);
  });
});
