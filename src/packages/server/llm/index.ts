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

const DEBUG_THROW_LLM_ERROR = process.env.DEBUG_THROW_LLM_ERROR === "true";

import { delay } from "awaiting";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import {
  DEFAULT_MODEL,
  LLM_USERNAMES,
  LanguageModel,
  OpenAIMessages,
  getLLMCost,
  isFreeModel,
  isMistralModel,
  isOllamaLLM,
  isValidModel,
  model2service,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { ChatOptions, ChatOutput, History } from "@cocalc/util/types/llm";
import { checkForAbuse } from "./abuse";
import { callChatGPTAPI } from "./call-llm";
import { getClient } from "./client";
import { evaluateMistral } from "./mistral";
import { evaluateOllama } from "./ollama";
import { saveResponse } from "./save-response";
import { VertexAIClient } from "./vertex-ai-client";

const log = getLogger("llm");

// ATTN: do not move/rename this function, because it is used in hub/client.coffee!
export async function evaluate(opts: ChatOptions): Promise<string> {
  // We mainly wrap the high level call to keep all error messages hidden
  const { model = DEFAULT_MODEL } = opts;
  if (!isValidModel(model)) {
    throw Error(`unsupported model "${model}"`);
  }
  try {
    return await evaluateImpl(opts);
  } catch (err) {
    // We want to avoid leaking any information about the error to the client
    log.debug("error calling AI language model", err);
    throw new Error(
      `There is a problem calling ${
        LLM_USERNAMES[model] ?? model
      }. Please try another model, a different prompt, or try again later. ${
        !err?.unsafe ? err : ""
      }`,
    );
  }
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
  log.debug("evaluateImpl", {
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

  const { output, total_tokens, prompt_tokens, completion_tokens } =
    await (async () => {
      if (isOllamaLLM(model)) {
        return await evaluateOllama({
          system,
          history,
          input,
          model,
          maxTokens,
          stream,
        });
      } else if (isMistralModel(model)) {
        return await evaluateMistral({
          system,
          history,
          input,
          model,
          maxTokens,
          stream,
        });
      } else {
        return await evaluteCall({
          system,
          history,
          input,
          model,
          maxTokens,
          stream,
        });
      }
    })();

  log.debug("response: ", { output, total_tokens, prompt_tokens });
  const total_time_s = (Date.now() - start) / 1000;

  if (account_id) {
    if (isFreeModel(model)) {
      // no charge for now...
    } else {
      // charge for ALL other models.
      const { pay_as_you_go_openai_markup_percentage } =
        await getServerSettings();
      const c = getLLMCost(model, pay_as_you_go_openai_markup_percentage);
      const cost =
        c.prompt_tokens * prompt_tokens +
        c.completion_tokens * completion_tokens;

      try {
        await createPurchase({
          account_id,
          project_id,
          cost,
          service: model2service(model),
          description: {
            type: model2service(model),
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

async function evaluteCall({
  system,
  history,
  input,
  model,
  maxTokens,
  stream,
}) {
  const client = await getClient(model);

  if (client instanceof VertexAIClient) {
    return await evaluateVertexAI({
      system,
      history,
      input,
      client,
      maxTokens,
      model,
      stream,
    });
  }

  return await evaluateOpenAI({
    system,
    history,
    input,
    client,
    model,
    maxTokens,
    stream,
  });
}

interface EvalVertexAIProps {
  client: VertexAIClient;
  system?: string;
  history?: History;
  input: string;
  // maxTokens?: number;
  model: LanguageModel; // only "chat-bison-001" | "gemini-pro";
  stream?: (output?: string) => void;
  maxTokens?: number; // only gemini-pro
}

async function evaluateVertexAI({
  client,
  system,
  history,
  input,
  model,
  maxTokens,
  stream,
}: EvalVertexAIProps): Promise<ChatOutput> {
  if (model !== "chat-bison-001" && model !== "gemini-pro") {
    throw new Error(`model ${model} not supported`);
  }

  // TODO: for OpenAI, this is at 3. Unless we really know there are similar issues, we keep this at 1.
  // ATTN: If you increase this, you have to figure out how to reset the already returned stream of tokens.
  const maxAttempts = 1;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await client.chat({
        history: history ?? [],
        input,
        context: system,
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
  throw Error("Google Vertex AI API called failed"); // this should never get reached.
}

async function evaluateOpenAI({
  system,
  history,
  input,
  client,
  model,
  maxTokens,
  stream,
}): Promise<ChatOutput> {
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
