import { describe, expect, it } from "vitest";
import { fitFromRequirements, type Requirement } from "./job-analysis.js";

const req = (kind: Requirement["kind"], met: boolean): Requirement => ({ description: "x", kind, met });

describe("fitFromRequirements", () => {
  it.each([
    [5, 4, "HIGH"],
    [5, 3, "MEDIUM"],
    [4, 2, "MEDIUM"],
    [5, 2, "LOW"],
  ] as const)("%i required, %i met: %s", (total, met, expected) => {
    const requirements = Array.from({ length: total }, (_, i) => req("REQUIRED", i < met));

    expect(fitFromRequirements(requirements)).toBe(expected);
  });

  it("only counts REQUIRED when the post has any", () => {
    const requirements = [req("REQUIRED", true), req("NICE_TO_HAVE", false), req("NICE_TO_HAVE", false)];

    expect(fitFromRequirements(requirements)).toBe("HIGH");
  });

  it("falls back to every requirement when none is REQUIRED", () => {
    expect(fitFromRequirements([req("NICE_TO_HAVE", true), req("NICE_TO_HAVE", false)])).toBe("MEDIUM");
  });

  it("is LOW when there are no requirements", () => {
    expect(fitFromRequirements([])).toBe("LOW");
  });
});
