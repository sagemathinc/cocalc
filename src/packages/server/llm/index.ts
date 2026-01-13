/*
Backend server side part of AI language model integrations with CoCalc.

High level summary:
* evaluteImple:
   1. dispatch based on the requested model, by first picking the client and then calling it.
   2. charge the user if not free
   3. save the result in the database
* If "stream" is not null, either stream token by token or everything at once at the end – do not ignore it!
* The ChatOutput interface is what they return in any case.
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
  OpenAIModel,
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
  isXaiModel,
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

// ATTN: do not move/rename this function, because it is used in hub/client.coffee!
export async function evaluate(opts: ChatOptions): Promise<string> {
  // We mainly wrap the high level call to keep all error messages hidden
  const model = opts.model ?? (await getDefaultModel());
  if (!isValidModel(model)) {
    throw new Error(`unsupported model "${model}"`);
  }
  try {
    return await evaluateImpl(opts);
  } catch (err) {
    // We want to avoid leaking any information about the error to the client
    log.debug("error calling AI language model", err, err.stack);
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

// We wrap the stream callback in such a way, that the data stream is throttled.
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
      // if the last object in buffer is the end object, remove it
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
  anonymous_id,
  history,
  model = DEFAULT_MODEL,
  tag,
  stream,
  maxTokens,
}: ChatOptions): Promise<string> {
  // LARGE -- e.g., complete input -- only uncomment when developing if you need this.
  //   log.debug("evaluateImpl", {
  //     input,
  //     history,
  //     system,
  //     account_id,
  //     anonymous_id,
  //     project_id,
  //     path,
  //     model,
  //     tag,
  //     stream: stream != null,
  //     maxTokens,
  //   });

  const start = Date.now();
  await checkForAbuse({ account_id, anonymous_id, model });

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
      // Use the unified LangChain implementation
      if (isUserDefinedModel(model)) {
        return await evaluateUserDefinedLLM(params, account_id);
      } else if (isOllamaLLM(model)) {
        return await evaluateOllama(params);
      } else if (
        isCustomOpenAI(model) ||
        isMistralModel(model) ||
        isAnthropicModel(model) ||
        isGoogleModel(model) ||
        isOpenAIModel(model) ||
        isXaiModel(model)
      ) {
        // Use unified implementation for LangChain-based providers
        return await evaluateWithLangChain(params);
      } else {
        throw new Error(`Unable to handel model '${model}'.`);
      }
    })();

  log.debug("response: ", { output, total_tokens, prompt_tokens });
  const total_time_s = (Date.now() - start) / 1000;

  if (account_id) {
    const is_cocalc_com =
      (await getServerSettings()).kucalc === KUCALC_COCALC_COM;
    if (isFreeModel(model, is_cocalc_com) || !isCoreLanguageModel(model)) {
      // no charge for now...
    } else {
      // charge for ALL other models.
      const { pay_as_you_go_openai_markup_percentage } =
        await getServerSettings();
      const c = getLLMCost(model, pay_as_you_go_openai_markup_percentage);
      const cost =
        c.prompt_tokens * prompt_tokens +
        c.completion_tokens * completion_tokens;

      // we can exclude Ollama, because these are only non-free ones
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
        // we maybe just lost some money?!
        log.error(
          `FAILED to CREATE a purchase for something the user just got: cost=${cost}, account_id=${account_id}`,
        );
        // we might send an email or something...?
      }
    }
  }

  saveResponse({
    input,
    system,
    output,
    history,
    account_id,
    anonymous_id,
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

export function normalizeOpenAIModel(model): OpenAIModel {
  // the *-8k variants are artificial – the input is already limited/truncated to 8k
  // convert *-preview and all *-8k to their base model names
  const modelPrefixes = [
    "gpt-5.2",
    "gpt-5-mini",
    "gpt-5",
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-4.1-mini",
    "gpt-4.1",
    "o4-mini",
    "o3",
    "o1-mini",
    "o1",
  ];

  for (const prefix of modelPrefixes) {
    if (model.startsWith(prefix)) {
      model = prefix;
      break;
    }
  }

  if (!isOpenAIModel(model)) {
    throw new Error(`Internal problem normalizing OpenAI model name: ${model}`);
  }
  return model;
}
