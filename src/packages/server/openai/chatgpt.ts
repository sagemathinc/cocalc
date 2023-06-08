/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { checkForAbuse } from "./abuse";
import type { Model } from "@cocalc/util/db-schema/openai";
import { delay } from "awaiting";
import getClient from "./client";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { pii_retention_to_future } from "@cocalc/database/postgres/pii";
import GPT3Tokenizer from "gpt3-tokenizer";
import { EventEmitter } from "events";
import { once } from "@cocalc/util/async-utils";
import createPurchase from "@cocalc/server/purchases/create-purchase";

const GPT4_MARKUP = 1 / 0.7; // 30% cut, same as apple app store
export const GPT4_COST = {
  prompt_tokens: (GPT4_MARKUP * 0.03) / 1000,
  completion_tokens: (GPT4_MARKUP * 0.06) / 1000,
};
// The maximum cost for one single GPT-4 api call.
// We can't know the cost until after it happens, so use this bound.
export const GPT4_MAX_COST =
  Math.max(GPT4_COST.prompt_tokens, GPT4_COST.completion_tokens) * 8192;

const log = getLogger("chatgpt");

interface ChatOptions {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  account_id?: string;
  project_id?: string;
  path?: string;
  analytics_cookie?: string;
  history?: { role: "assistant" | "user" | "system"; content: string }[];
  model?: Model; // default is gpt-3.5-turbo
  tag?: string;
  // If stream is set, then everything works as normal with two exceptions:
  // - The stream function is called with bits of the output as they are produced,
  //   until the output is done and then it is called with undefined.
  // - Maybe the total_tokens, which is stored in the database for analytics,
  //   might be off: https://community.openai.com/t/openai-api-get-usage-tokens-in-response-when-set-stream-true/141866
  stream?: (output?: string) => void;
  maxTokens?: number;
}

export async function evaluate({
  input,
  system,
  account_id,
  project_id,
  path,
  analytics_cookie,
  history,
  model = "gpt-3.5-turbo",
  tag,
  stream,
  maxTokens,
}: ChatOptions): Promise<string> {
  log.debug("evaluate", {
    input,
    history,
    system,
    account_id,
    analytics_cookie,
    project_id,
    path,
    model,
    tag,
    stream: stream != null,
    maxTokens,
  });
  const start = Date.now();
  await checkForAbuse({ account_id, analytics_cookie, model });
  const openai = await getClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  if (history) {
    for (const message of history) {
      messages.push(message);
    }
  }
  messages.push({ role: "user", content: input });
  const { output, total_tokens, prompt_tokens, completion_tokens } =
    await callOpenaiAPI({
      openai,
      model,
      messages,
      maxAttempts: 3,
      maxTokens,
      stream,
    });
  log.debug("response: ", { output, total_tokens, prompt_tokens });
  const total_time_s = (Date.now() - start) / 1000;

  if (account_id) {
    if (model == "gpt-3.5-turbo") {
      // no charge for now
    } else if (model == "gpt-4") {
      // charge the current rate
      const cost =
        prompt_tokens * GPT4_COST.prompt_tokens +
        completion_tokens * GPT4_COST.completion_tokens;
      try {
        await createPurchase({
          account_id,
          project_id,
          cost,
          service: "openai-gpt-4",
          description: {
            type: "openai-gpt-4",
            prompt_tokens,
            completion_tokens,
          },
          tag: `openai:${tag ?? ""}`,
        });
      } catch (err) {
        // we maybe just lost some money?!
        log.error(
          `FAILED to CREATE a purchase for something the user just got: cost=${cost}, account_id=${account_id}`
        );
        // we might send an email or something...?
      }
    } else {
      log.error(
        `BUG -- there should be no way that model isn't gpt-3.5-turbo or gpt-4, but it is '${model}'`
      );
    }
  }

  let expire;
  if (account_id == null) {
    // this never happens right now since it's disabled; we may
    // bring this back with captcha
    const { pii_retention } = await getServerSettings();
    expire = pii_retention_to_future(pii_retention);
  } else {
    expire = undefined;
  }

  saveResponse({
    input,
    system,
    output,
    history,
    account_id,
    analytics_cookie,
    project_id,
    path,
    total_tokens,
    prompt_tokens,
    total_time_s,
    model,
    tag,
    expire,
  });

  // NOTE about expire: If the admin setting for "PII Retention" is set *and*
  // the usage is only identified by their analytics_cookie, then
  // we automatically delete the log of chatgpt usage at the expiration time.
  // If the account_id *is* set, users can do the following:
  // 1. Ability to delete any of their past chatgpt usage
  // 2. If a user deletes their account, also delete their past chatgpt usage log.
  // 3. Make it easy to search and see their past usage.
  // See https://github.com/sagemathinc/cocalc/issues/6577
  // There's no reason to automatically delete "PII" attached
  // to an actual user that has access to that data (and can delete it); otherwise,
  // we would have to delete every single thing anybody types anywhere in cocalc,
  // e.g., when editing a Jupyter notebook or really anything else at all, and
  // that makes no sense at all.

  return output;
}

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
async function saveResponse({
  input,
  system,
  output,
  history,
  account_id,
  analytics_cookie,
  project_id,
  path,
  total_tokens,
  prompt_tokens,
  total_time_s,
  expire,
  model,
  tag,
}) {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO openai_chatgpt_log(time,input,system,output,history,account_id,analytics_cookie,project_id,path,total_tokens,prompt_tokens,total_time_s,expire,model,tag) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        input,
        system,
        output,
        history,
        account_id,
        analytics_cookie,
        project_id,
        path,
        total_tokens,
        prompt_tokens,
        total_time_s,
        expire,
        model,
        tag,
      ]
    );
  } catch (err) {
    log.warn("Failed to save ChatGPT log entry to database:", err);
  }
}

// We use this since openai will periodically just fail, but then work
// if you try again -- it's a distributed network service and the api
// definitely has a failure rate.  Given an openai api connection, model,
// list of messages, and number maxAttempts, this will try to make the
// call up to maxAttempts times, then throw an error if it fails
// maxAttempts times.

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
        const token = mesg.choices[0].delta.content;
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

async function callOpenaiAPI({
  openai,
  model,
  messages,
  maxAttempts,
  stream,
  maxTokens,
}): Promise<{
  output: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}> {
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
        axiosOptions
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
        "retry"
      );
      if (!retry) {
        throw err;
      }
      await delay(1000);
    }
  }
  throw Error("chatgpt api called failed"); // this should never get reached.
}

// a little bit of this code is replicated in
// packages/frontend/misc/openai.ts
const APPROX_CHARACTERS_PER_TOKEN = 8;
const tokenizer = new GPT3Tokenizer({ type: "gpt3" });
function numTokens(content: string): number {
  // slice to avoid extreme slowdown "attack".
  return tokenizer.encode(content.slice(0, 8000 * APPROX_CHARACTERS_PER_TOKEN))
    .text.length;
}
function totalNumTokens(messages: { content: string }[]): number {
  let s = 0;
  for (const { content } of messages) {
    s += numTokens(content);
  }
  return s;
}
