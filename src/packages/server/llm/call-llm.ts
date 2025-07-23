import { delay } from "awaiting";
import type OpenAI from "openai";
import getLogger from "@cocalc/backend/logger";
import { OpenAIMessages, OpenAIModel } from "@cocalc/util/db-schema/llm-utils";
import type {
  ChatOutput,
  Stream as StreamFunction,
} from "@cocalc/util/types/llm";
import { totalNumTokens } from "./chatgpt-numtokens";
import type { Stream } from "openai/streaming";

const log = getLogger("llm:call-llm");

interface CallChatGPTOpts {
  openai: OpenAI;
  model: OpenAIModel;
  messages: OpenAIMessages;
  maxAttempts: number;
  maxTokens?: number;
  stream?: StreamFunction;
}

class GatherOutput {
  private output: string = "";
  private total_tokens: number;
  private prompt_tokens: number;
  private completion_tokens: number;
  private stream: StreamFunction;

  constructor(messages: OpenAIMessages, stream: StreamFunction) {
    this.prompt_tokens = this.total_tokens = totalNumTokens(messages);
    this.completion_tokens = 0;
    this.stream = stream;
  }

  public async process(
    completion: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>,
  ) {
    for await (const part of completion) {
      const token = part.choices[0]?.delta?.content ?? "";
      if (token) {
        this.output += token;
        this.stream(token); // tell the client about the new token
        this.total_tokens += 1;
        this.completion_tokens += 1;
      }
    }

    this.stream(null); //  signals we're done

    return {
      output: this.output,
      total_tokens: this.total_tokens,
      prompt_tokens: this.prompt_tokens,
      completion_tokens: this.completion_tokens,
    };
  }
}

// We use this since openai will periodically just fail, but then work
// if you try again -- it's a distributed network service and the api
// definitely has a failure rate.  Given an openai api connection, model,
// list of messages, and number maxAttempts, this will try to make the
// call up to maxAttempts times, then throw an error if it fails
// maxAttempts times.
export async function callChatGPTAPI({
  openai,
  model,
  messages,
  maxAttempts,
  stream,
  maxTokens,
}: CallChatGPTOpts): Promise<ChatOutput> {
  const doStream = stream != null;
  const gather = doStream ? new GatherOutput(messages, stream) : undefined;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // we check $doStream early, to get the correct type for $completion
      if (!doStream) {
        const completion = await openai.chat.completions.create({
          max_tokens: maxTokens,
          model,
          messages,
          stream: false,
        });

        const output = (
          completion.choices[0].message?.content ?? "No Output"
        ).trim();
        const total_tokens = completion.usage?.total_tokens ?? 0;
        const prompt_tokens = completion.usage?.prompt_tokens ?? 0;
        const completion_tokens = completion.usage?.completion_tokens ?? 0;
        return { output, total_tokens, prompt_tokens, completion_tokens };
      } else {
        const completion = await openai.chat.completions.create({
          max_tokens: maxTokens,
          model,
          messages,
          stream: true,
        });

        if (gather == null) {
          throw Error("bug");
        }

        // collect up the results and return result.
        return await gather.process(completion);
      }
    } catch (err) {
      const retry = i < maxAttempts - 1;
      log.debug(
        "chatgpt api call failed",
        err,
        " will ",
        retry ? "" : "NOT",
        "retry",
      );
      if (!retry) {
        throw err;
      }
      await delay(1000);
    }
  }
  throw Error("chatgpt api called failed"); // this should never get reached.
}
