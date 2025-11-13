import { AIMessageChunk } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { concat } from "@langchain/core/utils/stream";
import { ChatMistralAI, ChatMistralAIInput } from "@langchain/mistralai";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import { isMistralModel } from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { transformHistoryToMessages } from "./chat-history";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:mistral");

interface MistralOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: Stream;
  maxTokens?: number;
  apiKey?: string;
}

async function getParams(model) {
  const settings = await getServerSettings();
  const { mistral_enabled, mistral_api_key } = settings;

  if (!mistral_enabled) {
    throw new Error(`Mistral is not enabled.`);
  }

  if (!mistral_api_key) {
    throw new Error(`Mistral api key is not configured.`);
  }

  return { apiKey: mistral_api_key, model: model };
}

export async function evaluateMistral(
  opts: Readonly<MistralOpts>,
  mode: "cocalc" | "user" = "cocalc",
): Promise<ChatOutput> {
  if (mode === "cocalc" && !isMistralModel(opts.model)) {
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

  const params: ChatMistralAIInput =
    mode === "cocalc" ? await getParams(model) : { apiKey: opts.apiKey, model };

  const mistral = new ChatMistralAI(params);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(mistral);

  let historyTokens = 0;

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey: "history",
    getMessageHistory: async () => {
      const { messageHistory, tokens } =
        await transformHistoryToMessages(history);
      historyTokens = tokens;
      return messageHistory;
    },
  });

  const chunks = await chainWithHistory.stream({ input });

  let finalResult: AIMessageChunk | undefined;
  let output = "";
  for await (const chunk of chunks) {
    const { content } = chunk;
    if (typeof content !== "string") continue;
    output += content;
    opts.stream?.(content);

    // Collect the final result to check for usage metadata
    if (finalResult) {
      finalResult = concat(finalResult, chunk);
    } else {
      finalResult = chunk;
    }
  }

  opts.stream?.(null);

  // Check for usage metadata from LangChain first (more accurate)
  const usage_metadata = finalResult?.usage_metadata;
  log.debug("usage_metadata", usage_metadata);

  if (usage_metadata) {
    const { input_tokens, output_tokens, total_tokens } = usage_metadata;
    log.debug("evaluateMistral successful (using usage_metadata)", {
      input_tokens,
      output_tokens,
      total_tokens,
    });

    return {
      output,
      total_tokens,
      completion_tokens: output_tokens,
      prompt_tokens: input_tokens,
    };
  } else {
    // Fallback to manual token counting (approximation using GPT-3 tokenizer)
    const prompt_tokens = numTokens(input) + historyTokens;
    const completion_tokens = numTokens(output);

    log.debug("evaluateMistral successful (using manual counting)", {
      prompt_tokens,
      completion_tokens,
    });

    return {
      output,
      total_tokens: prompt_tokens + completion_tokens,
      completion_tokens,
      prompt_tokens,
    };
  }
}
