import { delay } from "awaiting";
import { EventEmitter } from "events";

import getLogger from "@cocalc/backend/logger";
import { once } from "@cocalc/util/async-utils";
import { ChatOutput } from "@cocalc/util/types/llm";
import { totalNumTokens } from "./chatgpt-numtokens";

const log = getLogger("llm:call-chatgpt");

class GatherOutput extends EventEmitter {
  private output: string = "";
  private total_tokens: number;
  private prompt_tokens: number;
  private completion_tokens: number;
  private stream: (text?: string) => void;

  constructor(messages, stream) {
    super();
    this.prompt_tokens = this.total_tokens = totalNumTokens(messages);
    this.completion_tokens = 0;
    this.stream = stream;
  }

  process(data: Buffer) {
    const text = data.toString();
    const lines = text.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }
      const s = line.slice(6);
      if (s == "[DONE]") {
        this.emit("done", {
          output: this.output,
          total_tokens: this.total_tokens,
          prompt_tokens: this.prompt_tokens,
          completion_tokens: this.completion_tokens,
        });
        this.stream();
      } else {
        let mesg;
        try {
          mesg = JSON.parse(s);
        } catch (err) {
          log.error(`chatgpt -- could not parse s='${s}'`, { text });
        }
        const token = mesg?.choices[0].delta.content;
        if (token != null) {
          this.output += token;
          this.stream(token);
          this.total_tokens += 1;
          this.completion_tokens += 1;
        }
      }
    }
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
}): Promise<ChatOutput> {
  const doStream = stream != null;
  const gather = doStream ? new GatherOutput(messages, stream) : undefined;
  const axiosOptions = doStream ? { responseType: "stream" } : {};
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const completion = await openai.createChatCompletion(
        {
          max_tokens: maxTokens,
          model,
          messages,
          stream: doStream,
        },
        axiosOptions,
      );
      if (!doStream) {
        const output = (
          completion.data.choices[0].message?.content ?? "No Output"
        ).trim();
        const total_tokens = completion.data.usage?.total_tokens;
        const prompt_tokens = completion.data.usage?.prompt_tokens;
        const completion_tokens = completion.data.usage?.completion_tokens;
        return { output, total_tokens, prompt_tokens, completion_tokens };
      } else {
        if (gather == null) {
          throw Error("bug");
        }
        completion.data.on("data", gather.process.bind(gather));
        // collect up the results and return result.
        const x = await once(gather, "done");
        return x[0];
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
