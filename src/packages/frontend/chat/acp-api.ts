import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { AcpChatContext } from "@cocalc/conat/ai/acp/types";
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
  setCodexConfig?: (threadKey: string, config: any) => void;
  threadKey?: string;
  project_id?: string;
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

  const threadDate =
    context.threadKey != null ? new Date(Number(context.threadKey)) : undefined;
  const configDate =
    reply_to ??
    (threadDate && !Number.isNaN(threadDate.valueOf())
      ? threadDate
      : undefined);
  const config = context.getCodexConfig
    ? context.getCodexConfig(configDate)
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
  const { date } =
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
        };

  const id = uuid();
  chatStreams.add(id);
  setTimeout(() => chatStreams.delete(id), 3 * 60 * 1000);

  let messageDate: Date;
  if (date && typeof date !== "string") {
    messageDate = date;
  } else if (typeof date === "string") {
    messageDate = new Date(date);
  } else {
    messageDate = new Date();
  }
  if (Number.isNaN(messageDate.valueOf())) {
    throw new Error("Codex chat message has invalid date");
  }

  const chatMetadata = buildChatMetadata({
    project_id: context.project_id,
    path,
    sender_id,
    messageDate,
    reply_to,
  });
  try {
    const stream = await webapp_client.conat_client.streamAcp({
      prompt: workingInput,
      session_id: config?.sessionId,
      config: buildAcpConfig({
        path,
        config,
        model: normalizedModel,
      }),
      chat: chatMetadata,
    });
    for await (const message of stream) {
      console.log(message);
    }
  } catch (err) {
    console.warn("AI eval problem:", err);
  }
}

function normalizeCodexMention(model?: string): string | undefined {
  if (!model) return undefined;
  if (model === "codex-agent") {
    return undefined;
  }
  return model;
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
  if (config?.sessionId) {
    opts.sessionId = config.sessionId;
  }
  return opts;
}

function buildChatMetadata({
  project_id,
  path,
  sender_id,
  messageDate,
  reply_to,
}: {
  project_id?: string;
  path?: string;
  sender_id: string;
  messageDate: Date;
  reply_to?: Date;
}): AcpChatContext {
  if (!project_id) {
    throw new Error("Codex requires a project context to run");
  }
  if (!path) {
    throw new Error("Codex requires a chat file path");
  }
  if (!(messageDate instanceof Date) || Number.isNaN(messageDate.valueOf())) {
    throw new Error("Codex chat metadata missing timestamp");
  }
  return {
    project_id,
    path,
    sender_id,
    message_date: messageDate.toISOString(),
    reply_to: reply_to?.toISOString(),
  };
}
