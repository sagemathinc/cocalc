import getLogger from "@cocalc/backend/logger";
import {
  fromCustomOpenAIModel,
  isCustomOpenAI,
} from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import {
  ChatOpenAI as ChatOpenAILC,
  OpenAICallOptions,
} from "@langchain/openai";
import { transformHistoryToMessages } from "./chat-history";
import { numTokens } from "./chatgpt-numtokens";
import { getCustomOpenAI } from "./client";

const log = getLogger("llm:custom_openai");

// subset of ChatOptions, but model is a string
interface CustomOpenAIOpts {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  history?: History;
  model: string; // this must be custom_openai-[model]
  stream?: Stream;
  maxTokens?: number;
}

export async function evaluateCustomOpenAI(
  opts: Readonly<CustomOpenAIOpts>,
  client?: ChatOpenAILC<OpenAICallOptions>,
): Promise<ChatOutput> {
  if (client == null && !isCustomOpenAI(opts.model)) {
    throw new Error(`model ${opts.model} not supported`);
  }
  const model = fromCustomOpenAIModel(opts.model);
  const { system, history, input, maxTokens, stream } = opts;
  log.debug("evaluateCustomOpenAI", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const customOpenAI = client ?? (await getCustomOpenAI(model));

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system ?? ""],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(customOpenAI);

  let historyTokens = 0;

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey: "chat_history",
    getMessageHistory: async () => {
      const { messageHistory, tokens } = await transformHistoryToMessages(
        history,
      );
      historyTokens = tokens;
      return messageHistory;
    },
  });

  const chunks = await chainWithHistory.stream({ input });

  let output = "";
  for await (const chunk of chunks) {
    const { content } = chunk;
    if (typeof content !== "string") {
      break;
    }
    output += content;
    opts.stream?.(content);
  }

  // and an empty call when done
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
