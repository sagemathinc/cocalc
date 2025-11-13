import getLogger from "@cocalc/backend/logger";
import {
  fromCustomOpenAIModel,
  isCustomOpenAI,
} from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { AIMessageChunk } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { concat } from "@langchain/core/utils/stream";
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
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(customOpenAI);

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
    if (typeof content !== "string") {
      break;
    }
    output += content;
    opts.stream?.(content);

    // Collect the final result to check for usage metadata
    if (finalResult) {
      finalResult = concat(finalResult, chunk);
    } else {
      finalResult = chunk;
    }
  }

  // and an empty call when done
  opts.stream?.(null);

  // Check for usage metadata from LangChain first (more accurate)
  const usage_metadata = finalResult?.usage_metadata;
  log.debug("usage_metadata", usage_metadata);

  if (usage_metadata) {
    const { input_tokens, output_tokens, total_tokens } = usage_metadata;
    log.debug("evaluateCustomOpenAI successful (using usage_metadata)", {
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

    log.debug("evaluateCustomOpenAI successful (using manual counting)", {
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
