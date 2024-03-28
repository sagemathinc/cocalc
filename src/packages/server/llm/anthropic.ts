import { ChatAnthropic } from "@langchain/anthropic";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import {
  ANTHROPIC_VERSION,
  isAnthropicModel,
} from "@cocalc/util/db-schema/llm-utils";
import { ChatOutput, History } from "@cocalc/util/types/llm";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:anthropic");

interface AnthropicOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: (output?: string) => void;
  maxTokens?: number;
}

export async function evaluateAnthropic(
  opts: Readonly<AnthropicOpts>,
): Promise<ChatOutput> {
  if (!isAnthropicModel(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const { system, history, input, maxTokens, stream, model } = opts;

  log.debug("evaluateAnthropic", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const settings = await getServerSettings();
  const { anthropic_enabled, anthropic_api_key: anthropicApiKey } = settings;

  if (!anthropic_enabled) {
    throw new Error(`Anthropic is not enabled.`);
  }

  if (!anthropicApiKey) {
    throw new Error(`Anthropic api key is not configured.`);
  }

  // They do not have a "*-latest" … but we need stable model names
  const modelName = `${model}-${ANTHROPIC_VERSION[model]}`;

  const anthropic = new ChatAnthropic({
    anthropicApiKey,
    modelName,
    maxTokens,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(anthropic);

  let historyTokens = 0;

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
          historyTokens += numTokens(content);
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
