export type RequirementKind = "REQUIRED" | "NICE_TO_HAVE";

export interface Requirement {
  readonly description: string;
  readonly kind: RequirementKind;
  readonly met: boolean;
  /** What in the resume backs the answer. */
  readonly evidence?: string;
}

export type Fit = "LOW" | "MEDIUM" | "HIGH";

export interface JobAnalysis {
  readonly requirements: readonly Requirement[];
  readonly fit: Fit;
  readonly missingKeywords: readonly string[];
  readonly tailoredBullets: readonly string[];
}

// The model judges each requirement; the fit is derived here, in code, so the
// same requirements always give the same fit (ADR-004).
export function fitFromRequirements(requirements: readonly Requirement[]): Fit {
  const required = requirements.filter((requirement) => requirement.kind === "REQUIRED");
  const considered = required.length > 0 ? required : requirements;
  if (considered.length === 0) return "LOW";

  const metRatio = considered.filter((requirement) => requirement.met).length / considered.length;
  if (metRatio >= 0.8) return "HIGH";
  if (metRatio >= 0.5) return "MEDIUM";
  return "LOW";
}
