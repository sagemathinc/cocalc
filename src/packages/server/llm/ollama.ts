import getLogger from "@cocalc/backend/logger";
import { ChatOutput, History } from "@cocalc/util/types/llm";
import { getOllama } from "./client";

const log = getLogger("llm:ollama");

// subset of ChatOptions, but model is a string
interface OllamaOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: (output?: string) => void;
  maxTokens?: number;
}

export async function evaluateOllama(
  opts: Readonly<OllamaOpts>,
): Promise<ChatOutput> {
  if (!opts.model.startsWith("ollama-")) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const model = opts.model.slice("ollama-".length);
  const { system, history, input, maxTokens, stream } = opts;
  log.debug("evaluateOllama", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const ollama = await getOllama(model);

  const chunks = await ollama.stream(input);

  let output = "";
  for await (const chunk of chunks) {
    output += chunk;
    opts.stream?.(chunk);
  }

  // and an empty call when done
  opts.stream?.();

  const prompt_tokens = 10;
  const completion_tokens = 10;

  return {
    output,
    total_tokens: prompt_tokens + completion_tokens,
    completion_tokens,
    prompt_tokens,
  };
}
