// Composition root for the local script: the only place that knows which
// adapter backs each port. Usage: pnpm analyze <job.txt> <resume.txt>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { BedrockLanguageModel } from "../adapters/aws/bedrock-language-model.js";
import { analyzeJob } from "../application/analyze-job.js";

const [jobPath, resumePath] = process.argv.slice(2);
const modelId = process.env.BEDROCK_MODEL_ID;
if (!jobPath || !resumePath || !modelId) {
  console.error("Usage: BEDROCK_MODEL_ID=<model or inference profile id> pnpm analyze <job.txt> <resume.txt>");
  process.exit(1);
}

// pnpm runs the script inside apps/api; INIT_CWD is where the user typed the command.
const fromUserDir = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const [jobText, resumeText] = await Promise.all([
  readFile(fromUserDir(jobPath), "utf8"),
  readFile(fromUserDir(resumePath), "utf8"),
]);

// No keys in code: the SDK finds credentials through its default chain (AWS_PROFILE, aws login session).
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-2", maxAttempts: 3 });
const result = await analyzeJob(new BedrockLanguageModel(client, modelId), { jobText, resumeText });

console.log(JSON.stringify(result, null, 2));
if (result.status === "ERROR") process.exit(2);
