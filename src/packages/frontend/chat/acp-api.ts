import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type {
  AcpStreamMessage,
  AcpStreamUsage,
} from "@cocalc/conat/ai/acp/types";
import {
  DEFAULT_CODEX_MODELS,
  type CodexSessionConfig,
} from "@cocalc/util/ai/codex";
import { uuid } from "@cocalc/util/misc";

import type { ChatMessage, MessageHistory } from "./types";

interface AcpContext {
  syncdb?: {
    set: (opts: any) => void;
    commit: () => void;
    get_one: (opts: any) => any;
  };
  path?: string;
  chatStreams: Set<string>;
  sendReply: (opts: {
    message: ChatMessage;
    reply?: string;
    from?: string;
    noNotification?: boolean;
    reply_to?: Date;
    submitMentionsRef?: any;
  }) => string;
  saveHistory: (
    message: ChatMessage,
    content: string,
    author_id: string,
    generating?: boolean,
  ) => {
    date: string;
    prevHistory: MessageHistory[];
  };
  getLLMHistory: (reply_to: Date) => LanguageModelHistory;
  getCodexConfig?: (reply_to?: Date) => any;
}

type ProcessAcpRequest = {
  message: ChatMessage;
  reply_to?: Date;
  tag?: string;
  model: string;
  input: string;
  context: AcpContext;
  dateLimit?: Date;
};

export async function processAcpLLM({
  message,
  reply_to,
  tag,
  model,
  input,
  context,
  dateLimit,
}: ProcessAcpRequest): Promise<void> {
  const { syncdb, path, chatStreams, sendReply, saveHistory, getLLMHistory } =
    context;
  if (syncdb == null) return;

  let workingInput = input?.trim();
  if (!workingInput) {
    return;
  }

  const config = context.getCodexConfig
    ? context.getCodexConfig(reply_to)
    : undefined;
  const normalizedModel =
    typeof model === "string" ? normalizeCodexMention(model) : undefined;

  if (tag === "regenerate") {
    const history = reply_to ? getLLMHistory(reply_to) : [];
    if (history.length >= 2) {
      history.pop();
      while (dateLimit != null && history.length >= 2) {
        const last = history[history.length - 1];
        const lastMs =
          last.date != null ? new Date(last.date as any).valueOf() : undefined;
        if (lastMs != null && lastMs > dateLimit.valueOf()) {
          history.pop();
          history.pop();
        } else {
          break;
        }
      }
      workingInput = history.pop()?.content ?? workingInput;
    } else {
      return;
    }
  }

  const sender_id = model || "openai-codex-agent";
  const thinking = ":robot: Thinking...";
  const { date, prevHistory = [] } =
    tag === "regenerate"
      ? saveHistory(message, thinking, sender_id, true)
      : {
          date: sendReply({
            message,
            reply: thinking,
            from: sender_id,
            noNotification: true,
            reply_to,
          }),
          prevHistory: [],
        };

  const id = uuid();
  chatStreams.add(id);
  setTimeout(() => chatStreams.delete(id), 3 * 60 * 1000);

  let content = "";
  let halted = false;
  let events: AcpStreamMessage[] = [];
  let threadId: string | null = null;
  let usage: AcpStreamUsage | null = null;

  const update = (generating: boolean) => {
    if (syncdb == null) return;
    const msg: ChatMessage = {
      event: "chat",
      sender_id,
      date: new Date(date),
      history: addToHistory(prevHistory, {
        author_id: sender_id,
        content,
      }),
      generating,
      reply_to: reply_to?.toISOString(),
      acp_events: events,
      acp_thread_id: threadId,
      acp_usage: usage,
    };
    syncdb.set(msg);
    if (!generating) {
      syncdb.commit();
    }
  };

  try {
    const stream = await webapp_client.conat_client.streamAcp({
      prompt: workingInput,
      session_id: config?.sessionId,
      config: buildAcpConfig({
        path,
        config,
        model: normalizedModel,
      }),
    });

    for await (const message of stream) {
      if (halted) break;

      events = appendStreamMessage(events, message);

      const cur = syncdb.get_one({ event: "chat", date });
      if (cur?.get("generating") === false) {
        halted = true;
        chatStreams.delete(id);
        break;
      }

      if ((message as any).type === "error") {
        const errorText = (message as any).error ?? "Unknown error";
        content += `\n\n<span style='color:#b71c1c'>${errorText}</span>\n\n`;
        break;
      }

      if (message.type === "event") {
        const text = extractEventText(message.event);
        if (text) {
          content = text;
          update(true);
        }
        continue;
      }

      if (message.type === "summary") {
        if (message.threadId) {
          threadId = message.threadId;
        }
        if (message.usage) {
          usage = message.usage;
        }
        content = message.finalResponse ?? content;
        break;
      }
    }
  } catch (err) {
    content += `\n\n<span style='color:#b71c1c'>${err}</span>\n\n`;
  } finally {
    chatStreams.delete(id);
    update(false);
  }
}

function extractEventText(event: any): string | undefined {
  if (event == null || typeof event !== "object") return;
  if (typeof event.text === "string") {
    return event.text;
  }
  return;
}

function appendStreamMessage(
  events: AcpStreamMessage[],
  message: AcpStreamMessage,
): AcpStreamMessage[] {
  if (message.type !== "event") {
    return [...events, message];
  }
  const last = events[events.length - 1];
  const nextEvent = message.event;
  if (
    last?.type === "event" &&
    last.event?.type === nextEvent?.type &&
    typeof last.event?.text === "string" &&
    typeof nextEvent?.text === "string"
  ) {
    const merged: AcpStreamMessage = {
      ...last,
      event: {
        ...last.event,
        text: last.event.text + nextEvent.text,
      },
      seq: message.seq ?? last.seq,
    };
    return [...events.slice(0, -1), merged];
  }
  return [...events, message];
}

function normalizeCodexMention(model?: string): string | undefined {
  if (!model) return undefined;
  if (model === "codex-agent") {
    return undefined;
  }
  return model;
}

function addToHistory(
  history: MessageHistory[],
  next: Partial<MessageHistory> & { author_id: string; content: string },
): MessageHistory[] {
  const { author_id, content, date = new Date().toISOString() } = next;
  return [{ author_id, content, date }, ...history];
}

function resolveWorkingDir(chatPath?: string): string {
  if (!chatPath) return ".";
  const i = chatPath.lastIndexOf("/");
  if (i <= 0) return ".";
  return chatPath.slice(0, i);
}

function buildAcpConfig({
  path,
  config,
  model,
}: {
  path?: string;
  config?: any;
  model?: string;
}): CodexSessionConfig {
  const baseWorkingDir = resolveWorkingDir(path);
  const workingDirectory = config?.workingDirectory || baseWorkingDir;
  const opts: CodexSessionConfig = {
    workingDirectory,
  };
  const defaultModel = DEFAULT_CODEX_MODELS[0]?.name ?? "gpt-5.1-codex-max";
  const selectedModel = config?.model ?? model ?? defaultModel;
  if (selectedModel) {
    opts.model = selectedModel;
  }
  const modelInfo = DEFAULT_CODEX_MODELS.find((m) => m.name === selectedModel);
  const selectedReasoning =
    config?.reasoning ?? modelInfo?.reasoning?.find((r) => r.default)?.id;
  if (selectedReasoning) {
    opts.reasoning = selectedReasoning;
  }
  opts.allowWrite = !!config?.allowWrite;
  const env: Record<string, string> = {};
  if (config?.envHome) env.HOME = config.envHome;
  if (config?.envPath) env.PATH = config.envPath;
  if (Object.keys(env).length) {
    opts.env = env;
  }
  if (config?.codexPathOverride) {
    opts.codexPathOverride = config.codexPathOverride;
  }
  return opts;
}
