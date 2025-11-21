import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CodexStreamMessage, Usage } from "@cocalc/conat/codex/types";
import { uuid } from "@cocalc/util/misc";

import type { ChatMessage, MessageHistory } from "./types";

interface CodexContext {
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

type ProcessCodexRequest = {
  message: ChatMessage;
  reply_to?: Date;
  tag?: string;
  model: string;
  input: string;
  context: CodexContext;
  dateLimit?: Date;
};

export async function processCodexLLM({
  message,
  reply_to,
  tag,
  model,
  input,
  context,
  dateLimit,
}: ProcessCodexRequest): Promise<void> {
  const {
    syncdb,
    path,
    chatStreams,
    sendReply,
    saveHistory,
    getLLMHistory,
  } =
    context;
  if (syncdb == null) return;

  let workingInput = input?.trim();
  if (!workingInput) {
    return;
  }

  const config = context.getCodexConfig
    ? context.getCodexConfig(reply_to)
    : undefined;
  const selectedModel = config?.model ?? model;

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
  let events: CodexStreamMessage[] = [];
  let threadId: string | null = null;
  let usage: Usage | null = null;

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
      codex_events: events,
      codex_thread_id: threadId,
      codex_usage: usage,
    };
    syncdb.set(msg);
    if (!generating) {
      syncdb.commit();
    }
  };

  try {
    const stream = await webapp_client.conat_client.streamCodex({
      input: workingInput,
      thread_options: buildThreadOptions({
        path,
        config,
        model: selectedModel,
      }),
      codex_options: buildCodexOptions(config),
    });

    for await (const message of stream) {
      if (halted) break;

      events = [...events, message];

      const cur = syncdb.get_one({ event: "chat", date });
      if (cur?.get("generating") === false) {
        halted = true;
        chatStreams.delete(id);
        break;
      }

      if (message.type === "error") {
        content += `\n\n<span style='color:#b71c1c'>${message.error}</span>\n\n`;
        break;
      }

      if (message.type === "event") {
        const text = extractAgentText(message.event);
        if (message.event?.type === "thread.started") {
          threadId = message.event.thread_id;
        }
        if (message.event?.type === "turn.completed" && message.event.usage) {
          usage = message.event.usage;
        }
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

function extractAgentText(event: any): string | undefined {
  if (event == null || typeof event !== "object") return;
  const item = event.item;
  if (item?.type === "agent_message") {
    return item.text;
  }
  if (typeof event.message === "string") {
    return event.message;
  }
  return;
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

function buildThreadOptions({
  path,
  config,
  model,
}: {
  path?: string;
  config?: any;
  model?: string;
}) {
  const opts: any = {
    workingDirectory: resolveWorkingDir(path),
    skipGitRepoCheck: true,
  };
  if (model) {
    opts.model = model;
  }
  const reasoning = config?.reasoning;
  if (reasoning) {
    opts.modelReasoningEffort = reasoning;
  }
  if (config?.allowWrite != null) {
    opts.sandboxMode = config.allowWrite ? "workspace-write" : "read-only";
  }
  return opts;
}

function buildCodexOptions(config?: any) {
  if (!config) return undefined;
  const env: any = {};
  if (config.envHome) env.HOME = config.envHome;
  if (config.envPath) env.PATH = config.envPath;
  const options: any = {};
  if (Object.keys(env).length) options.env = env;
  if (config.allowWrite != null) {
    options.permissions = { write: !!config.allowWrite };
  }
  if (config.codexPathOverride) {
    options.codexPathOverride = config.codexPathOverride;
  }
  return Object.keys(options).length ? options : undefined;
}
