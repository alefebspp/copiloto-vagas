// Generic on purpose: the prompt and the output schema belong to the
// application, so changing providers only means writing a new adapter (ADR-004).
export interface StructuredRequest {
  system: string;
  prompt: string;
  tool: {
    name: string;
    description: string;
    /** JSON Schema the model must fill in. */
    inputSchema: Record<string, unknown>;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredResponse {
  /** Not trusted: the caller validates it. Null when the model did not call the tool. */
  output: unknown;
  usage: TokenUsage;
}

export interface LanguageModel {
  generateStructured(request: StructuredRequest): Promise<StructuredResponse>;
}
