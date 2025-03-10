import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import { isGoogleModel } from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { transformHistoryToMessages } from "./chat-history";
import { numTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:google-lc");

interface GoogleGenAIOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be ollama-[model]
  stream?: Stream;
  maxTokens?: number;
  apiKey?: string;
}

async function getParams(model: string) {
  const settings = await getServerSettings();
  const { google_vertexai_enabled, google_vertexai_key } = settings;

  if (!google_vertexai_enabled) {
    throw new Error(`Google GenAI is not enabled.`);
  }

  if (!google_vertexai_key) {
    throw new Error(`Google GenAI api key is not configured.`);
  }

  return {
    apiKey: google_vertexai_key,
    model,
  };
}

export async function evaluateGoogleGenAILC(
  opts: Readonly<GoogleGenAIOpts>,
  mode: "cocalc" | "user" = "cocalc",
): Promise<ChatOutput> {
  if (mode === "cocalc" && !isGoogleModel(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const { system, history, input, maxTokens, stream, model } = opts;

  log.debug("evaluateGoogleLC", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const params =
    mode === "cocalc" ? await getParams(model) : { apiKey: opts.apiKey, model };

  const genAI = new ChatGoogleGenerativeAI({
    ...params,
    maxOutputTokens: maxTokens,
    streaming: stream != null,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(genAI);

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

  let output = "";
  for await (const chunk of chunks) {
    const { content } = chunk;
    if (typeof content !== "string") continue;
    output += content;
    opts.stream?.(content);
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
