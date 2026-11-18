import { describe, expect, it } from "vitest";
import type { LanguageModel, StructuredRequest, StructuredResponse } from "../domain/ports/language-model.js";
import { analyzeJob } from "./analyze-job.js";

const validOutput = {
  requirements: [
    { description: "TypeScript", kind: "REQUIRED", met: true, evidence: "4 years with TypeScript" },
    { description: "Kafka", kind: "REQUIRED", met: false },
    { description: "AWS", kind: "NICE_TO_HAVE", met: false },
  ],
  missingKeywords: ["Kafka"],
  tailoredBullets: ["one", "two", "three"],
};

// A fake model that answers with the given outputs in order and records each request.
function fakeModel(...outputs: unknown[]) {
  const requests: StructuredRequest[] = [];
  const model: LanguageModel = {
    generateStructured(request): Promise<StructuredResponse> {
      requests.push(request);
      return Promise.resolve({ output: outputs[requests.length - 1], usage: { inputTokens: 100, outputTokens: 50 } });
    },
  };
  return { model, requests };
}

const input = { jobText: "We need TypeScript and Kafka.", resumeText: "4 years with TypeScript." };

describe("analyzeJob", () => {
  it("returns the validated analysis with the fit derived in code", async () => {
    const { model } = fakeModel(validOutput);

    const result = await analyzeJob(model, input);

    expect(result).toMatchObject({ status: "READY", attempts: 1, usage: { inputTokens: 100, outputTokens: 50 } });
    if (result.status !== "READY") throw new Error("unreachable");
    expect(result.analysis.fit).toBe("MEDIUM");
    expect(result.analysis.requirements[1]).toEqual({ description: "Kafka", kind: "REQUIRED", met: false });
  });

  it("sends the job post, the resume and a tool schema the model must fill", async () => {
    const { model, requests } = fakeModel(validOutput);

    await analyzeJob(model, input);

    expect(requests[0]?.prompt).toContain(input.jobText);
    expect(requests[0]?.prompt).toContain(input.resumeText);
    expect(requests[0]?.tool.name).toBe("record_analysis");
    expect(requests[0]?.tool.inputSchema).toMatchObject({ type: "object" });
    expect(requests[0]?.tool.inputSchema.required).toEqual(["requirements", "missingKeywords", "tailoredBullets"]);
    expect(requests[0]?.tool.inputSchema).not.toHaveProperty("$schema");
  });

  it("retries once when the output is invalid and adds up the tokens of both attempts", async () => {
    const { model } = fakeModel({ ...validOutput, tailoredBullets: ["only one"] }, validOutput);

    const result = await analyzeJob(model, input);

    expect(result).toMatchObject({ status: "READY", attempts: 2, usage: { inputTokens: 200, outputTokens: 100 } });
  });

  it("gives up with ERROR after two invalid outputs, without a third paid call", async () => {
    const { model, requests } = fakeModel(null, { ...validOutput, requirements: [] });

    const result = await analyzeJob(model, input);

    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({ status: "ERROR", attempts: 2 });
    if (result.status !== "ERROR") throw new Error("unreachable");
    expect(result.reason).toContain("requirements");
  });

  it("does not retry infrastructure errors: they propagate", async () => {
    const model: LanguageModel = { generateStructured: () => Promise.reject(new Error("AccessDeniedException")) };

    await expect(analyzeJob(model, input)).rejects.toThrow("AccessDeniedException");
  });
});
