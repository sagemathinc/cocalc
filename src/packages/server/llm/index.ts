/*
Backend server side part of AI language model integrations with CoCalc.

This file assumes the newer LangChain-based implementation is always used.
It dispatches to provider-specific helpers (mostly via evaluateWithLangChain),
charges users when appropriate, and records responses.
*/

import { throttle } from "lodash";
import getLogger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import {
  DEFAULT_MODEL,
  LLM_USERNAMES,
  LanguageModel,
  LanguageServiceCore,
  getLLMCost,
  isAnthropicModel,
  isCoreLanguageModel,
  isCustomOpenAI,
  isFreeModel,
  isGoogleModel,
  isMistralModel,
  isOllamaLLM,
  isOpenAIModel,
  isUserDefinedModel,
  isValidModel,
  model2service,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import type { ChatOptions } from "@cocalc/util/types/llm";
import { checkForAbuse } from "./abuse";
import { evaluateWithLangChain } from "./evaluate-lc";
import { evaluateOllama } from "./ollama";
import { saveResponse } from "./save-response";
import { evaluateUserDefinedLLM } from "./user-defined";

const THROTTLE_STREAM_MS = envToInt("COCALC_LLM_THROTTLE_STREAM_MS", 500);
const DEBUG_THROW_LLM_ERROR = process.env.DEBUG_THROW_LLM_ERROR === "true";
const log = getLogger("llm");

async function getDefaultModel(): Promise<LanguageModel> {
  return ((await getServerSettings()).default_llm ??
    DEFAULT_MODEL) as LanguageModel;
}

export async function evaluate(opts: ChatOptions): Promise<string> {
  const model = opts.model ?? (await getDefaultModel());
  if (!isValidModel(model)) {
    throw new Error(`unsupported model "${model}"`);
  }
  try {
    return await evaluateImpl(opts);
  } catch (err: any) {
    log.debug("error calling AI language model", err, err?.stack);
    if (DEBUG_THROW_LLM_ERROR) throw err;
    throw new Error(
      `There is a problem calling ${
        LLM_USERNAMES[model] ?? model
      }. Please try another model, a different prompt, or try again later. ${
        !err?.unsafe ? err : ""
      }`,
    );
  }
}

// Throttle stream callbacks to avoid flooding the client.
function wrapStream(stream?: ChatOptions["stream"]) {
  if (stream == null) return undefined;

  const end = { token: "end" };
  const buffer: (string | typeof end)[] = [];
  let closed = false;

  const throttled = throttle(
    () => {
      if (buffer.length === 0) {
        return;
      }
      if (closed) {
        throw new Error("stream closed");
      }
      closed = buffer[buffer.length - 1] === end;
      if (closed) {
        buffer.pop();
      }
      const str = buffer.join("");
      buffer.length = 0;
      if (str.length > 0) {
        stream(str);
      }
      if (closed) {
        stream(null);
      }
    },
    THROTTLE_STREAM_MS,
    { leading: true, trailing: true },
  );

  const wrapped = (output: string | null): void => {
    buffer.push(output == null ? end : output);
    throttled();
  };

  return wrapped;
}

async function evaluateImpl({
  input,
  system,
  account_id,
  project_id,
  path,
  analytics_cookie,
  history,
  model = DEFAULT_MODEL,
  tag,
  stream,
  maxTokens,
}: ChatOptions): Promise<string> {
  const start = Date.now();
  await checkForAbuse({ account_id, analytics_cookie, model });

  stream = wrapStream(stream);

  const params = {
    system,
    history,
    input,
    model,
    maxTokens,
    stream,
  } as const;

  const { output, total_tokens, prompt_tokens, completion_tokens } =
    await (async () => {
      if (isUserDefinedModel(model)) {
        return await evaluateUserDefinedLLM(params, account_id);
      }
      if (isOllamaLLM(model)) {
        return await evaluateOllama(params);
      }
      if (
        isCustomOpenAI(model) ||
        isMistralModel(model) ||
        isAnthropicModel(model) ||
        isGoogleModel(model) ||
        isOpenAIModel(model)
      ) {
        return await evaluateWithLangChain(params);
      }
      throw new Error(`Unable to handle model '${model}'.`);
    })();

  log.debug("response: ", { output, total_tokens, prompt_tokens });
  const total_time_s = (Date.now() - start) / 1000;

  if (account_id) {
    const is_cocalc_com =
      (await getServerSettings()).kucalc === KUCALC_COCALC_COM;
    if (isFreeModel(model, is_cocalc_com) || !isCoreLanguageModel(model)) {
      // free models or non-core models are not charged
    } else {
      const { pay_as_you_go_openai_markup_percentage } =
        await getServerSettings();
      const c = getLLMCost(model, pay_as_you_go_openai_markup_percentage);
      const cost =
        c.prompt_tokens * prompt_tokens +
        c.completion_tokens * completion_tokens;

      const service = model2service(model) as LanguageServiceCore;
      try {
        await createPurchase({
          account_id,
          project_id,
          cost,
          service,
          description: {
            type: service,
            prompt_tokens,
            completion_tokens,
          },
          tag: `${model2vendor(model)}:${tag ?? ""}`,
          client: null,
        });
      } catch (err) {
        log.error(
          `FAILED to CREATE a purchase; cost=${cost}, account_id=${account_id}`,
        );
      }
    }
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
  });

  return output;
}
