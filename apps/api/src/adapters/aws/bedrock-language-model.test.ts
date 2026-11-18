import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { BedrockLanguageModel } from "./bedrock-language-model.js";

const bedrock = mockClient(BedrockRuntimeClient);
const request = {
  system: "system prompt",
  prompt: "user prompt",
  tool: { name: "record_analysis", description: "Records it.", inputSchema: { type: "object" } },
};

describe("BedrockLanguageModel", () => {
  beforeEach(() => bedrock.reset());

  it("forces the tool, sends the model id and returns the tool input with token usage", async () => {
    bedrock.on(ConverseCommand).resolves({
      output: { message: { role: "assistant", content: [{ toolUse: { toolUseId: "1", name: "record_analysis", input: { ok: true } } }] } },
      usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
    });
    const model = new BedrockLanguageModel(new BedrockRuntimeClient({ region: "us-east-2" }), "us.amazon.nova-lite-v1:0");

    const response = await model.generateStructured(request);

    expect(response).toEqual({ output: { ok: true }, usage: { inputTokens: 1200, outputTokens: 300 } });
    const sent = bedrock.commandCalls(ConverseCommand)[0]?.args[0].input;
    expect(sent?.modelId).toBe("us.amazon.nova-lite-v1:0");
    expect(sent?.toolConfig?.toolChoice).toEqual({ tool: { name: "record_analysis" } });
    expect(sent?.system).toEqual([{ text: "system prompt" }]);
  });

  it("returns a null output when the model answers with text instead of the tool", async () => {
    bedrock.on(ConverseCommand).resolves({ output: { message: { role: "assistant", content: [{ text: "Sure!" }] } } });
    const model = new BedrockLanguageModel(new BedrockRuntimeClient({ region: "us-east-2" }), "model");

    expect(await model.generateStructured(request)).toEqual({ output: null, usage: { inputTokens: 0, outputTokens: 0 } });
  });
});
