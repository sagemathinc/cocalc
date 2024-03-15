import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import getLogger from "@cocalc/backend/logger";
import { fromOllamaModel, isOllamaLLM } from "@cocalc/util/db-schema/llm-utils";
import { ChatOutput, History } from "@cocalc/util/types/llm";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { numTokens } from "./chatgpt-numtokens";
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
  if (!isOllamaLLM(opts.model)) {
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

  const ollama = await getOllama(model);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(ollama);

  let historyTokens = 0;

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey: "chat_history",
    getMessageHistory: async (_) => {
      const chatHistory = new ChatMessageHistory();
      if (history) {
        let nextRole: "model" | "user" = "user";
        for (const { content } of history) {
          historyTokens = numTokens(content);
          if (nextRole === "user") {
            await chatHistory.addMessage(new HumanMessage(content));
          } else {
            await chatHistory.addMessage(new AIMessage(content));
          }
          nextRole = nextRole === "user" ? "model" : "user";
        }
      }

      return chatHistory;
    },
  });

  const chunks = await chainWithHistory.stream({ input });

  let output = "";
  for await (const chunk of chunks) {
    output += chunk;
    opts.stream?.(chunk);
  }

  // and an empty call when done
  opts.stream?.();

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
