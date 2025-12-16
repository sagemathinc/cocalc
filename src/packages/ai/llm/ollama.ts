import type { Ollama } from "@langchain/ollama";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";

import getLogger from "@cocalc/backend/logger";
import { fromOllamaModel, isOllamaLLM } from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { transformHistoryToMessages } from "./chat-history";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:ollama");

// subset of ChatOptions, but model is a string
interface OllamaOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: Stream;
  maxTokens?: number;
}

export interface OllamaContext {
  getOllama?: (model: string) => Promise<Ollama>;
}

export async function evaluateOllama(
  opts: Readonly<OllamaOpts>,
  ctx?: OllamaContext,
  client?: Ollama,
): Promise<ChatOutput> {
  if (client == null && !isOllamaLLM(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const model = fromOllamaModel(opts.model);
  const { system, history, input, maxTokens, stream } = opts;
  log.debug("evaluateOllama", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const ollama = client ?? (await ctx?.getOllama?.(model));
  if (!ollama) {
    throw new Error("No Ollama client available");
  }

  const historyMessagesKey = "history";

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder(historyMessagesKey),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(ollama);

  let historyTokens = 0;

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey,
    getMessageHistory: async () => {
      const { messageHistory, tokens } =
        await transformHistoryToMessages(history);
      historyTokens = tokens;
      return messageHistory;
    },
  });

  const chunks = await chainWithHistory.stream({ input });

  let output = "";
  for await (const chunk of chunks) {
    output += chunk;
    opts.stream?.(chunk);
  }

  opts.stream?.(null);

  // we use that GPT3 tokenizer to get an approximate number of tokens
  const prompt_tokens = numTokens(input) + historyTokens;
  const completion_tokens = numTokens(output);

  return {
    output,
    total_tokens: prompt_tokens + completion_tokens,
    completion_tokens,
    prompt_tokens,
  };
}
