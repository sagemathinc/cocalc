import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";

export type History = {
  role: "assistant" | "user" | "system";
  content: string;
}[];

export interface ChatOutput {
  output: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatOptionsApi {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  account_id?: string;
  project_id?: string;
  path?: string;
  anonymous_id?: string;
  history?: History;
  model?: LanguageModel; // default is defined by server setting default_llm
  tag?: string;
  maxTokens?: number;
  timeout?: number;
}

export type Stream = (output: string | null) => void;

export interface ChatOptions extends ChatOptionsApi {
  // If stream is set, then everything works as normal with two exceptions:
  // - The stream function is called with bits of the output as they are produced,
  //   until the output is done and then it is called with undefined.
  // - Maybe the total_tokens, which is stored in the database for analytics,
  //   might be off: https://community.openai.com/t/openai-api-get-usage-tokens-in-response-when-set-stream-true/141866
  stream?: Stream;
}

// This could be Ollama or CustomOpenAI
export interface CustomLLMPublic {
  model: string;
  display: string; // name of the model
  desc?: string; // additional description
  icon?: string; // fallback to OllamaAvatar
}
