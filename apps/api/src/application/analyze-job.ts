import { z } from "zod";
import { fitFromRequirements, type JobAnalysis } from "../domain/job-analysis.js";
import type { LanguageModel, TokenUsage } from "../domain/ports/language-model.js";

const modelOutputSchema = z.object({
  requirements: z
    .array(
      z.object({
        description: z.string().min(1),
        kind: z.enum(["REQUIRED", "NICE_TO_HAVE"]),
        met: z.boolean(),
        evidence: z.string().optional(),
      }),
    )
    .min(1),
  missingKeywords: z.array(z.string().min(1)),
  tailoredBullets: z.array(z.string().min(1)).length(3),
});

// The $schema key is metadata some providers reject; the schema itself is what matters.
const inputSchema: Record<string, unknown> = { ...z.toJSONSchema(modelOutputSchema) };
delete inputSchema.$schema;

const TOOL = {
  name: "record_analysis",
  description: "Records the analysis of a job post against the candidate's resume.",
  inputSchema,
};

const SYSTEM = `You are a career assistant analyzing a job post against a candidate's resume.
- List every requirement in the job post. Mark it REQUIRED or NICE_TO_HAVE as the post states it.
- For each requirement, decide if the resume meets it. Quote or paraphrase the resume in "evidence". Never assume skills the resume does not show.
- missingKeywords: important terms from the post that do not appear in the resume.
- tailoredBullets: exactly 3 resume bullets rewritten for this job, using only facts from the resume.
- Write in the same language as the job post.
Always answer by calling the ${TOOL.name} tool.`;

// A new sample can fix a bad output, but every attempt is paid in tokens.
const MAX_ATTEMPTS = 2;

export type AnalyzeJobResult =
  | { status: "READY"; analysis: JobAnalysis; usage: TokenUsage; attempts: number }
  | { status: "ERROR"; reason: string; usage: TokenUsage; attempts: number };

export async function analyzeJob(
  model: LanguageModel,
  input: { jobText: string; resumeText: string },
): Promise<AnalyzeJobResult> {
  const prompt = `<job_post>\n${input.jobText}\n</job_post>\n\n<resume>\n${input.resumeText}\n</resume>`;
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let reason = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Infrastructure errors propagate: the SDK already retries throttling,
    // and a malformed request would fail the same way again.
    const response = await model.generateStructured({ system: SYSTEM, prompt, tool: TOOL });
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;

    const parsed = modelOutputSchema.safeParse(response.output);
    if (parsed.success) {
      const requirements = parsed.data.requirements.map(({ evidence, ...rest }) =>
        evidence ? { ...rest, evidence } : rest,
      );
      const analysis: JobAnalysis = {
        requirements,
        fit: fitFromRequirements(requirements),
        missingKeywords: parsed.data.missingKeywords,
        tailoredBullets: parsed.data.tailoredBullets,
      };
      return { status: "READY", analysis, usage, attempts: attempt };
    }
    reason = z.prettifyError(parsed.error);
  }

  return { status: "ERROR", reason, usage, attempts: MAX_ATTEMPTS };
}
