import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error.js";

describe("DomainError", () => {
  it("carries a semantic code and no HTTP status", () => {
    const error = new DomainError("INVALID_TRANSITION", "SAVED cannot move straight to TECHNICAL");

    expect(error.code).toBe("INVALID_TRANSITION");
    expect(error.message).toBe("SAVED cannot move straight to TECHNICAL");
    expect(Object.keys(error)).not.toContain("status");
  });

  it("can be told apart from unexpected errors at the edge", () => {
    const errors: unknown[] = [new DomainError("JOB_NOT_FOUND", "job 01J..."), new Error("timeout")];

    expect(errors.map((error) => error instanceof DomainError)).toEqual([true, false]);
  });
});
