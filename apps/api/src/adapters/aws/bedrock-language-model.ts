import { ConverseCommand, type BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import type { LanguageModel, StructuredRequest, StructuredResponse } from "../../domain/ports/language-model.js";

export class BedrockLanguageModel implements LanguageModel {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
  ) {}

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: request.system }],
        messages: [{ role: "user", content: [{ text: request.prompt }] }],
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: request.tool.name,
                description: request.tool.description,
                inputSchema: { json: request.tool.inputSchema as DocumentType },
              },
            },
          ],
          // Forces the model to answer through the tool instead of free text.
          toolChoice: { tool: { name: request.tool.name } },
        },
        inferenceConfig: { maxTokens: 2000, temperature: 0 },
      }),
    );

    const toolUse = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse;
    return {
      output: toolUse?.input ?? null,
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
      },
    };
  }
}
