/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { EventEmitter } from "events";
import { redux } from "@cocalc/frontend/app-framework";
import {
  LanguageModel,
  LanguageServiceCore,
  getSystemPrompt,
  isFreeModel,
  model2service,
} from "@cocalc/util/db-schema/llm-utils";
import type { WebappClient } from "./client";
import type { History } from "./types";
import {
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
  OTHER_SETTINGS_REPLY_ENGLISH_KEY,
} from "@cocalc/util/i18n/const";
import { sanitizeLocale } from "@cocalc/frontend/i18n";

interface QueryLLMProps {
  input: string;
  model: LanguageModel;
  system?: string;
  history?: History;
  project_id?: string;
  path?: string;
  chatStream?: ChatStream; // if given, uses chat stream
  tag?: string;
  startStreamExplicitly?: boolean;
}

export class LLMClient {
  private client: WebappClient;

  constructor(client: WebappClient) {
    this.client = client;
  }

  public async query(opts: QueryLLMProps): Promise<string> {
    return await this.queryLanguageModel(opts);
  }

  // ATTN/TODO: startExplicitly seems to be broken
  public queryStream(opts, startExplicitly = false): ChatStream {
    const chatStream = new ChatStream();
    (async () => {
      try {
        await this.queryLanguageModel({ ...opts, chatStream });
        if (!startExplicitly) {
          chatStream.emit("start");
        }
      } catch (err) {
        chatStream.emit("error", err);
      }
    })();
    return chatStream;
  }

  private async queryLanguageModel({
    input,
    model,
    system, // if not set, a default system prompt is used – disable by setting to ""
    history,
    project_id,
    path,
    chatStream,
    tag = "",
  }: QueryLLMProps): Promise<string> {
    system ??= getSystemPrompt(model, path);

    // remove all date entries from all history objects
    if (history != null) {
      for (const h of history) {
        delete h.date;
      }
    }

    if (!redux.getStore("projects").hasLanguageModelEnabled(project_id, tag)) {
      throw new Error(
        `Language model support is not currently enabled ${
          project_id ? "in this project" : "on this server"
        }. [tag=${tag}]`,
      );
    }

    input = input.trim();
    if (chatStream == null) {
      if (!input || input == "test") {
        return "Great! What can I assist you with today?";
      }
      if (input == "ping") {
        await delay(1000);
        return "Pong";
      }
    }

    // append a sentence to request to translate the output to the user's language – unless disabled
    const other_settings = redux.getStore("account").get("other_settings");
    const alwaysEnglish = !!other_settings.get(
      OTHER_SETTINGS_REPLY_ENGLISH_KEY,
    );
    const locale = sanitizeLocale(
      other_settings.get(OTHER_SETTINGS_LOCALE_KEY),
    );
    if (!alwaysEnglish && locale != "en") {
      const lang = LOCALIZATIONS[locale].name; // name is always in english
      system = `${system}\n\nYour answer must be written in the language ${lang}.`;
    }

    const is_cocalc_com = redux.getStore("customize").get("is_cocalc_com");

    if (!isFreeModel(model, is_cocalc_com)) {
      // Ollama and others are treated as "free"
      const service = model2service(model) as LanguageServiceCore;
      // when client gets non-free openai model request, check if allowed.  If not, show quota modal.
      const { allowed, reason } =
        await this.client.purchases_client.isPurchaseAllowed(service);

      if (!allowed) {
        await this.client.purchases_client.quotaModal({
          service,
          reason,
          allowed,
        });
      }
      // Now check again after modal dismissed...
      const x = await this.client.purchases_client.isPurchaseAllowed(service);
      if (!x.allowed) {
        throw Error(reason);
      }
    }

    // do not import until needed -- it is HUGE!
    const {
      numTokensUpperBound,
      truncateHistory,
      truncateMessage,
      getMaxTokens,
    } = await import("@cocalc/frontend/misc/llm");

    // We always leave some room for output:
    const maxTokens = getMaxTokens(model) - 1000;
    input = truncateMessage(input, maxTokens);
    const n = numTokensUpperBound(input, getMaxTokens(model));
    if (n >= maxTokens) {
      history = undefined;
    } else if (history != null) {
      history = truncateHistory(history, maxTokens - n, model);
    }
    // console.log("chatgpt", { input, system, history, project_id, path });
    const options = {
      input,
      system,
      project_id,
      path,
      history,
      model,
      tag: `app:${tag}`,
    };

    if (chatStream == null) {
      // not streaming
      return await this.client.conat_client.llm(options);
    }

    chatStream.once("start", async () => {
      // streaming version
      try {
        await this.client.conat_client.llm({
          ...options,
          stream: chatStream.process,
        });
      } catch (err) {
        chatStream.error(err);
      }
    });

    return "see stream for output";
  }
}

class ChatStream extends EventEmitter {
  constructor() {
    super();
  }

  process = (text: string | null) => {
    // emits undefined text when done (or err below)
    this.emit("token", text);
  };

  error = (err) => {
    this.emit("error", err);
  };
}

export type { ChatStream };
