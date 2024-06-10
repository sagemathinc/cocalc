import { AIMessageChunk } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { concat } from "@langchain/core/utils/stream";
import { ChatOpenAI } from "@langchain/openai";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import { isOpenAIModel } from "@cocalc/util/db-schema/llm-utils";
import { ChatOutput, History } from "@cocalc/util/types/llm";
import { transformHistoryToMessages } from "./chat-history";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:openai-lc");

interface OpenAIOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: (output?: string) => void;
  maxTokens?: number;
  apiKey?: string;
}

async function getParams(model: string) {
  const settings = await getServerSettings();
  const { openai_enabled, openai_api_key } = settings;

  if (!openai_enabled) {
    throw new Error(`OpenAI is not enabled.`);
  }

  if (!openai_api_key) {
    throw new Error(`OpenAI API key is not configured.`);
  }

  return { apiKey: openai_api_key, model };
}

export async function evaluateOpenAILC(
  opts: Readonly<OpenAIOpts>,
  mode: "cocalc" | "user" = "cocalc",
): Promise<ChatOutput> {
  if (mode === "cocalc" && !isOpenAIModel(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const { system, history, input, maxTokens, stream, model } = opts;

  log.debug("evaluateOpenAILC", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const params =
    mode === "cocalc" ? await getParams(model) : { apiKey: opts.apiKey, model };

  const openai = new ChatOpenAI({
    ...params,
    maxTokens,
    streaming: stream != null,
  }).bind({
    stream_options: { include_usage: true },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(openai);

  let historyTokens = 0;

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey: "history",
    getMessageHistory: async () => {
      const { messageHistory, tokens } = await transformHistoryToMessages(
        history,
      );
      historyTokens = tokens;
      return messageHistory;
    },
  });

  const chunks = await chainWithHistory.stream({
    input,
  });

  let finalResult: AIMessageChunk | undefined;
  let output = "";
  for await (const chunk of chunks) {
    const { content } = chunk;
    if (typeof content !== "string") continue;
    output += content;
    opts.stream?.(content);

    if (finalResult) {
      finalResult = concat(finalResult, chunk);
    } else {
      finalResult = chunk;
    }
  }

  // and an empty call when done
  opts.stream?.();

  // due to "include_usage:true", this should tell us everythingo
  // https://js.langchain.com/v0.2/docs/integrations/chat/openai#streaming-tokens
  const usage_metadata = finalResult?.usage_metadata;
  log.debug("usage_metadata", usage_metadata);

  if (usage_metadata) {
    const { input_tokens, output_tokens, total_tokens } = usage_metadata;
    return {
      output,
      total_tokens,
      completion_tokens: output_tokens,
      prompt_tokens: input_tokens,
    };
  } else {
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
}
