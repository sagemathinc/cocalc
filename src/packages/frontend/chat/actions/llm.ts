// LLM handling for chat actions.
// - Resolves which model to run (including Codex and @mentions).
// - Inserts “thinking” placeholder messages and streams tokens into the syncdoc.
// - Handles regenerate, Codex ACP turns, throttling, and error reporting.
// This file keeps the main actions.ts smaller; processLLM is the primary entry point.

import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  CUSTOM_OPENAI_PREFIX,
  LANGUAGE_MODEL_PREFIXES,
  OLLAMA_PREFIX,
  USER_LLM_PREFIX,
  model2service,
  model2vendor,
  type LanguageModel,
} from "@cocalc/util/db-schema/llm-utils";
import {
  toOllamaModel,
  toCustomOpenAIModel,
} from "@cocalc/util/db-schema/llm-utils";
import { uuid } from "@cocalc/util/misc";
import { addToHistory } from "@cocalc/chat";
import type { ChatMessage, MessageHistory } from "../types";
import { getReplyToRoot } from "../utils";
import type { History as LanguageModelHistory } from "@cocalc/frontend/client/types";

const MAX_CHAT_STREAM = 10;

export type LLMContext = {
  syncdb: any;
  store: any;
  chatStreams: Set<string>;
  getAllMessages: () => Map<string, any>;
  sendReply: (opts: {
    message: ChatMessage;
    reply?: string;
    from?: string;
    noNotification?: boolean;
    reply_to?: Date;
  }) => string;
  saveHistory: (
    message: ChatMessage,
    content: string,
    author_id: string,
    regenerate?: boolean,
  ) => { date: string; prevHistory: MessageHistory[] };
  getLLMHistory: (reply_to: Date) => LanguageModelHistory;
  getCodexConfig: (date?: Date) => any;
  setCodexConfig: (threadKey: string, cfg: any) => void;
  computeThreadKey: (baseDate?: number) => string | undefined;
  path?: string;
  project_id?: string;
};

export async function processLLM({
  ctx,
  message,
  reply_to,
  tag,
  llm,
  threadModel,
  dateLimit,
}: {
  ctx: LLMContext;
  message: ChatMessage;
  reply_to?: Date;
  tag?: string;
  llm?: LanguageModel;
  threadModel?: LanguageModel | false | null;
  dateLimit?: Date;
}): Promise<void> {
  const { syncdb, store } = ctx;
  if (!syncdb || !store) return;

  const inputRaw = message.history?.[0]?.content as string | undefined;
  if (inputRaw == null) return;
  if (!inputRaw && tag !== "regenerate") return;

  const model = resolveLLMModel({ message, reply_to, tag, llm, threadModel });
  if (model === false || model == null) return;

  let input = stripMentions(inputRaw);

  // Codex branch
  if (typeof model === "string" && model.includes("codex")) {
    await handleCodexTurn({
      ctx,
      message,
      reply_to,
      model,
      input,
    });
    return;
  }

  const sender_id = modelToSender(model);
  const { date, prevHistory } = ensureThinkingMessage({
    ctx,
    message,
    reply_to,
    tag,
    sender_id,
  });

  if (ctx.chatStreams.size > MAX_CHAT_STREAM) {
    throttleWarning({ ctx, date, sender_id });
    return;
  }

  const project_id = store.get("project_id");
  const path = store.get("path");
  const effectiveTag = !tag && reply_to ? "reply" : tag;

  track("chatgpt", {
    project_id,
    path,
    type: "chat",
    is_reply: !!reply_to,
    tag: effectiveTag,
    model,
  });

  const id = uuid();
  ctx.chatStreams.add(id);
  setTimeout(() => ctx.chatStreams.delete(id), 3 * 60 * 1000);

  let history = reply_to ? ctx.getLLMHistory(reply_to) : undefined;
  const regen = prepareRegenerateInput({ tag, history, dateLimit, reply_to });
  if (regen?.error) return;
  history = regen?.history ?? history;
  input = regen?.input ?? input;

  let chatStream;
  let content = "";
  const dateIso = toISOString(date) ?? (typeof date === "string" ? date : undefined);
  try {
    chatStream = webapp_client.openai_client.queryStream({
      input,
      history,
      project_id,
      path,
      model,
      tag: effectiveTag,
    });
  } catch (err) {
    ctx.chatStreams.delete(id);
    if (!ctx.syncdb) return;
    content += `\n\n<span style='color:#b71c1c'>${err}</span>`;
    ctx.syncdb.set({
      event: "chat",
      sender_id,
      date: dateIso ?? new Date(date),
      history: addToHistory(prevHistory, {
        author_id: sender_id,
        content,
      }),
      generating: false,
      reply_to: toISOString(reply_to),
    });
    ctx.syncdb.commit();
    return;
  }

  // Adjust sender_id when regenerating with explicit model
  if (tag === "regenerate" && llm != null && message.sender_id !== sender_id) {
    const cur = syncdb.get_one({ event: "chat", date });
    if (cur) {
      const messagesMap = ctx.getAllMessages();
      const replyRoot = getReplyToRoot({
        message: cur as any as ChatMessage,
        messages: messagesMap,
      });
      syncdb.delete({ event: "chat", date });
      syncdb.set({
        date,
        history: (cur as any)?.history ?? [],
        event: "chat",
        sender_id,
        reply_to: replyRoot,
      });
    }
  }

  let halted = false;

  chatStream.on("token", (token) => {
    if (halted || !ctx.syncdb) {
      return;
    }

    const cur = ctx.syncdb.get_one({ event: "chat", date: dateIso ?? date });
    if ((cur as any)?.generating === false) {
      halted = true;
      ctx.chatStreams.delete(id);
      return;
    }

    if (token != null) content += token;

    ctx.syncdb.set({
      event: "chat",
      sender_id,
      date: dateIso ?? new Date(date),
      history: addToHistory(prevHistory, {
        author_id: sender_id,
        content,
      }),
      generating: token != null,
      reply_to: toISOString(reply_to),
    });

    if (token == null) {
      ctx.chatStreams.delete(id);
      ctx.syncdb.commit();
    }
  });

  chatStream.on("error", (err) => {
    ctx.chatStreams.delete(id);
    if (!ctx.syncdb || halted) return;

    if (!model) {
      throw new Error(
        `bug: No model set, but we're in language model error handler`,
      );
    }

    const vendor = model2vendor(model);
    const statusCheck = getLLMServiceStatusCheckMD(vendor.name);
    content += `\n\n<span style='color:#b71c1c'>${err}</span>\n\n---\n\n${statusCheck}`;
    ctx.syncdb.set({
      event: "chat",
      sender_id,
      date: dateIso ?? new Date(date),
      history: addToHistory(prevHistory, {
        author_id: sender_id,
        content,
      }),
      generating: false,
      reply_to: toISOString(reply_to),
    });
    ctx.syncdb.commit();
  });
}

function resolveLLMModel({
  message,
  reply_to,
  tag,
  llm,
  threadModel,
}: {
  message: ChatMessage;
  reply_to?: Date;
  tag?: string;
  llm?: LanguageModel;
  threadModel?: LanguageModel | false | null;
}): LanguageModel | false | null {
  if (typeof llm === "string") {
    if (tag !== "regenerate") {
      console.warn(`chat/llm: llm=${llm} is only allowed for tag=regenerate`);
      return null;
    }
    return llm;
  }

  const input = message.history?.[0]?.content ?? "";
  const mentioned = getLanguageModel(input);
  const mentionedAny = mentionsLanguageModel(input);

  if (mentionedAny && mentioned) return mentioned;
  if (mentionedAny && !mentioned) return null;

  // No explicit mention: fall back to the thread's model (e.g. Codex threads)
  if (reply_to && threadModel) return threadModel;

  if (!reply_to) return null;
  return mentioned || threadModel || null;
}

function modelToSender(model: LanguageModel): string {
  try {
    return model2service(model);
  } catch {
    return model as string;
  }
}

function ensureThinkingMessage({
  ctx,
  message,
  reply_to,
  tag,
  sender_id,
}: {
  ctx: LLMContext;
  message: ChatMessage;
  reply_to?: Date;
  tag?: string;
  sender_id: string;
}): { date: string; prevHistory: MessageHistory[] } {
  const thinking = ":robot: Thinking...";
  if (tag === "regenerate") {
    return ctx.saveHistory(message, thinking, sender_id, true);
  }
  return {
    date: ctx.sendReply({
      message,
      reply: thinking,
      from: sender_id,
      noNotification: true,
      reply_to,
    }),
    prevHistory: [],
  };
}

function prepareRegenerateInput({
  tag,
  history,
  dateLimit,
  reply_to,
}: {
  tag?: string;
  history?: LanguageModelHistory;
  dateLimit?: Date;
  reply_to?: Date;
}): { history?: LanguageModelHistory; input?: string; error?: boolean } | null {
  if (tag !== "regenerate") return null;
  if (!history || history.length < 2) {
    console.warn(
      `chat/llm: regenerate called without enough history for thread starting at ${reply_to}`,
    );
    return { error: true };
  }
  const h = [...history];
  h.pop(); // remove last LLM message
  while (dateLimit != null && h.length >= 2) {
    const last = h[h.length - 1];
    if (last.date != null && last.date > dateLimit) {
      h.pop();
      h.pop();
    } else {
      break;
    }
  }
  const input = stripMentions(h.pop()?.content ?? "");
  return { history: h, input };
}

async function handleCodexTurn({
  ctx,
  message,
  reply_to,
  model,
  input,
}: {
  ctx: LLMContext;
  message: ChatMessage;
  reply_to?: Date;
  model: LanguageModel;
  input: string;
}): Promise<void> {
  const { syncdb, store } = ctx;
  if (!syncdb || !store) return;
  const project_id = store.get("project_id");
  const path = store.get("path");
  if (!project_id || !path) {
    throw new Error(
      "chat actions missing project_id or path; cannot run Codex turn",
    );
  }

  const baseDate =
    reply_to?.valueOf() ??
    (message.date instanceof Date
      ? message.date.valueOf()
      : new Date(message.date ?? Date.now()).valueOf());
  const threadKey = ctx.computeThreadKey(baseDate);

  // lazy import to avoid circular import issues
  const { processAcpLLM } = await import("../acp-api");

  await processAcpLLM({
    message,
    reply_to,
    model,
    input,
    context: {
      syncdb,
      path,
      project_id,
      chatStreams: ctx.chatStreams,
      sendReply: ctx.sendReply,
      saveHistory: ctx.saveHistory,
      getCodexConfig: (reply_to_date?: Date) =>
        ctx.getCodexConfig(reply_to_date ?? reply_to ?? undefined),
      setCodexConfig: ctx.setCodexConfig,
      threadKey,
    },
  });
}

function throttleWarning({
  ctx,
  date,
  sender_id,
}: {
  ctx: LLMContext;
  date: string;
  sender_id: string;
}) {
  if (!ctx.syncdb) return;
  ctx.syncdb.set({
    date,
    history: [
      {
        author_id: sender_id,
        content: `\n\n<span style='color:#b71c1c'>There are already ${MAX_CHAT_STREAM} language model responses being written. Please try again once one finishes.</span>\n\n`,
        date,
      },
    ],
    event: "chat",
    sender_id,
  });
  ctx.syncdb.commit();
}

function getLLMServiceStatusCheckMD(vendorName: string): string {
  // lazy import to avoid circular issues
  const {
    getLLMServiceStatusCheckMD,
  } = require("@cocalc/util/db-schema/llm-utils");
  return getLLMServiceStatusCheckMD(vendorName);
}

function stripMentions(value: string): string {
  if (!value) return "";
  const STRIP = ["@chatgpt", "@codex", "@local", "@local-gpu", "@ollama"];
  for (const name of STRIP) {
    while (true) {
      const i = value.toLowerCase().indexOf(name);
      if (i == -1) break;
      value = value.slice(0, i) + value.slice(i + name.length);
    }
  }
  while (true) {
    const i = value.indexOf('<span class="user-mention"');
    if (i == -1) break;
    const j = value.indexOf("</span>", i);
    if (j == -1) break;
    value = value.slice(0, i) + value.slice(j + "</span>".length);
  }
  return value.trim();
}

function mentionsLanguageModel(input?: string): boolean {
  const x = input?.toLowerCase() ?? "";
  const sys = LANGUAGE_MODEL_PREFIXES.some((prefix) =>
    x.includes(`account-id=${prefix}`),
  );
  if (sys || x.includes(`account-id=${USER_LLM_PREFIX}`)) return true;
  if (x.includes("openai-codex-agent") || x.includes("@codex")) return true;
  return false;
}

function getLanguageModel(input?: string): false | LanguageModel {
  if (!input) return false;
  const x = input.toLowerCase();
  if (x.includes("openai-codex-agent") || x.includes("@codex")) {
    return "codex-agent";
  }
  if (x.includes("account-id=chatgpt4")) {
    return "gpt-4";
  }
  if (x.includes("account-id=chatgpt")) {
    return "gpt-3.5-turbo";
  }
  for (const vendorPrefix of LANGUAGE_MODEL_PREFIXES) {
    const prefix = `account-id=${vendorPrefix}`;
    const i = x.indexOf(prefix);
    if (i != -1) {
      const j = x.indexOf(">", i);
      const model = x.slice(i + prefix.length, j).trim() as LanguageModel;
      if (vendorPrefix === OLLAMA_PREFIX) {
        return toOllamaModel(model);
      }
      if (vendorPrefix === CUSTOM_OPENAI_PREFIX) {
        return toCustomOpenAIModel(model);
      }
      if (vendorPrefix === USER_LLM_PREFIX) {
        return `${USER_LLM_PREFIX}${model}`;
      }
      return model;
    }
  }
  return false;
}

function toISOString(date?: Date | string): string | undefined {
  if (typeof date === "string") return date;
  try {
    return date?.toISOString();
  } catch {
    return;
  }
}
