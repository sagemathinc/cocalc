import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import {
  fromMistralService,
  isMistralService,
} from "@cocalc/util/db-schema/llm";
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
  if (!isMistralService(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const model = fromMistralService(opts.model);
  const { system, history, input, maxTokens, stream } = opts;

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

  const msgs: ["ai" | "human", string][] = [];

  if (history) {
    let nextRole: "model" | "user" = "user";
    for (const { content } of history) {
      if (nextRole === "user") {
        msgs.push(["human", content]);
      } else {
        msgs.push(["ai", content]);
      }
      nextRole = nextRole === "user" ? "model" : "user";
    }
  }

  const mistral = new ChatMistralAI({
    apiKey: mistral_api_key,
    modelName: model,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(mistral);

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    inputMessagesKey: "input",
    historyMessagesKey: "chat_history",
    getMessageHistory: async (_) => {
      const chatHistory = new ChatMessageHistory();
      // await history.addMessage(new HumanMessage("be brief"));
      // await history.addMessage(new AIMessage("ok"));
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

  const chunks = await chainWithHistory.stream(
    { input },
    { configurable: { sessionId: "ignored" } },
  );

  let output = "";
  for await (const chunk of chunks) {
    if (typeof chunk !== "string") continue;
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
