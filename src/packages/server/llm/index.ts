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

import { delay } from "awaiting";
import { throttle } from "lodash";
import OpenAI from "openai";

import getLogger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import {
  DEFAULT_MODEL,
  LLM_USERNAMES,
  LanguageModel,
  LanguageServiceCore,
  OpenAIMessages,
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
  model2service,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import type {
  ChatOptions,
  ChatOutput,
  History,
  Stream,
} from "@cocalc/util/types/llm";
import { checkForAbuse } from "./abuse";
import { evaluateAnthropic } from "./anthropic";
import { evaluateWithLangChain } from "./evaluate-lc";
import { callChatGPTAPI } from "./call-llm";
import { getClient } from "./client";
import { evaluateCustomOpenAI } from "./custom-openai";
import { GoogleGenAIClient } from "./google-genai-client";
import { evaluateMistral } from "./mistral";
import { evaluateOllama } from "./ollama";
import { evaluateOpenAILC } from "./openai-lc";
import { saveResponse } from "./save-response";
import { evaluateUserDefinedLLM } from "./user-defined";

const THROTTLE_STREAM_MS = envToInt("COCALC_LLM_THROTTLE_STREAM_MS", 500);

const DEBUG_THROW_LLM_ERROR = process.env.DEBUG_THROW_LLM_ERROR === "true";

const log = getLogger("llm");

// Feature flag to use the new unified LangChain implementation
export const USE_NEWER_LC_IMPL =
  (process.env.COCALC_LLM_USE_NEWER_LC_IMPL ?? "true") === "true";

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
      if (USE_NEWER_LC_IMPL) {
        // Use the new unified LangChain implementation
        if (isUserDefinedModel(model)) {
          return await evaluateUserDefinedLLM(params, account_id);
        } else if (isOllamaLLM(model)) {
          return await evaluateOllama(params);
        } else if (
          isCustomOpenAI(model) ||
          isMistralModel(model) ||
          isAnthropicModel(model) ||
          isGoogleModel(model) ||
          isOpenAIModel(model)
        ) {
          // Use unified implementation for LangChain-based providers
          return await evaluateWithLangChain(params);
        } else {
          throw new Error(`Unable to handel model '${model}'.`);
        }
      } else {
        // Use the original file-by-file implementation
        if (isUserDefinedModel(model)) {
          return await evaluateUserDefinedLLM(params, account_id);
        } else if (isOllamaLLM(model)) {
          return await evaluateOllama(params);
        } else if (isCustomOpenAI(model)) {
          return await evaluateCustomOpenAI(params);
        } else if (isMistralModel(model)) {
          return await evaluateMistral(params);
        } else if (isAnthropicModel(model)) {
          return await evaluateAnthropic(params);
        } else if (isGoogleModel(model)) {
          const client = await getClient(model);
          if (!(client instanceof GoogleGenAIClient)) {
            throw new Error("Wrong client. This should never happen. [GenAI]");
          }
          return await evaluateGoogleGenAI({ ...params, client });
        } else if (isOpenAIModel(model)) {
          return await evaluateOpenAILC(params);
        } else {
          throw new Error(`Unable to handel model '${model}'.`);
          // const client = await getClient(model);
          // if (!(client instanceof OpenAI)) {
          //   throw new Error("Wrong client. This should never happen. [OpenAI]");
          // }
          // return await evaluateOpenAI({ ...params, client });
        }
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

interface EvalVertexAIProps {
  client: GoogleGenAIClient;
  system?: string;
  history?: History;
  input: string;
  // maxTokens?: number;
  model: LanguageModel; // only "gemini-pro";
  stream?: Stream;
  maxTokens?: number; // only gemini-pro
}

export async function evaluateGoogleGenAI({
  client,
  system,
  history,
  input,
  model,
  maxTokens,
  stream,
}: EvalVertexAIProps): Promise<ChatOutput> {
  if (!isGoogleModel(model)) {
    throw new Error(`Model "${model}" not a Google model.`);
  }

  // TODO: for OpenAI, this is at 3. Unless we really know there are similar issues, we keep this at 1.
  // ATTN: If you increase this, you have to figure out how to reset the already returned stream of tokens.
  const maxAttempts = 1;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await client.chat({
        history: history ?? [],
        input,
        system,
        model,
        maxTokens,
        stream,
      });
    } catch (err) {
      const retry = i < maxAttempts - 1;
      if (DEBUG_THROW_LLM_ERROR) throw err;
      log.debug(
        "Google Vertex AI API call failed",
        err,
        ` will ${retry ? "" : "NOT"} retry`,
      );
      if (!retry) {
        // due to API key leak bug (which they will fix or probably already did fix)
        // TODO: get rid of this workaround as soon as we can, since it can very seriously
        // degrade the user experience not knowing why things break...
        err.unsafe = true;
        throw err;
      }
      await delay(1000);
    }
  }
  throw Error("Google Gen AI API called failed"); // this should never get reached.
}

export async function evaluateOpenAI({
  system,
  history,
  input,
  client,
  model,
  maxTokens,
  stream,
}: {
  system?: string;
  history?: History;
  input: string;
  client: OpenAI;
  model: any;
  maxTokens?: number;
  stream?: Stream;
}): Promise<ChatOutput> {
  if (!isOpenAIModel(model)) {
    throw new Error(`Model "${model}" not an OpenAI model.`);
  }

  model = normalizeOpenAIModel(model);

  const messages: OpenAIMessages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  if (history) {
    for (const message of history) {
      messages.push(message);
    }
  }
  messages.push({ role: "user", content: input });
  return await callChatGPTAPI({
    openai: client,
    model,
    messages,
    maxAttempts: 3,
    maxTokens,
    stream,
  });
}

export function normalizeOpenAIModel(model): OpenAIModel {
  // the *-8k variants are artificial – the input is already limited/truncated to 8k
  // convert *-preview and all *-8k to their base model names
  const modelPrefixes = [
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
