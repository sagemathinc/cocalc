import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import { isMistralModel } from "@cocalc/util/db-schema/llm-utils";
import { ChatOutput, History } from "@cocalc/util/types/llm";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

const log = getLogger("llm:mistral");

interface MistralOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: (output?: string) => void;
  maxTokens?: number;
}

export async function evaluateMistral(
  opts: Readonly<MistralOpts>,
): Promise<ChatOutput> {
  if (!isMistralModel(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const { system, history, input, maxTokens, stream, model } = opts;

  log.debug("evaluateMistral", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const settings = await getServerSettings();
  const { mistral_enabled, mistral_api_key } = settings;

  if (!mistral_enabled) {
    throw new Error(`Mistral is not enabled.`);
  }

  if (!mistral_api_key) {
    throw new Error(`Mistral api key is not configured.`);
  }

  const mistral = new ChatMistralAI({
    apiKey: mistral_api_key,
    modelName: model,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(mistral);

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey: "history",
    getMessageHistory: async (_) => {
      const chatHistory = new ChatMessageHistory();
      if (history) {
        let nextRole: "model" | "user" = "user";
        for (const { content } of history) {
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
    const { content } = chunk;
    log.debug(typeof chunk, { content, chunk });

    if (typeof content !== "string") continue;
    output += content;
    opts.stream?.(content);
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
