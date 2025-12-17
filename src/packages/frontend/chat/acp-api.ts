import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { AcpChatContext } from "@cocalc/conat/ai/acp/types";
import {
  DEFAULT_CODEX_MODELS,
  resolveCodexSessionMode,
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
    message: { date: string | Date };
    reply?: string;
    from?: string;
    noNotification?: boolean;
    reply_to?: Date;
    submitMentionsRef?: any;
  }) => string;
  saveHistory: (
    message: { date: string | Date; history?: MessageHistory[] },
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

  // date is the iso timestamp of the response message, which
  // will be set to thinking initially.
  let date: string;
  if (tag == "renerate") {
    ({ date } = saveHistory(message, thinking, sender_id, true));
  } else {
    date = sendReply({
      message,
      reply: thinking,
      from: sender_id,
      noNotification: true,
      reply_to,
    });
  }
  if (!date) {
    console.log("date not set", date);
    return;
  }
  syncdb.commit();

  const id = uuid();
  chatStreams.add(id);
  // NOTE: the stream is ONLY used to submit the message for acp;
  // the actual resonse is via a pub/sub channel.  Thus this 3 minutes
  // is fine, even if the response is very long.
  setTimeout(() => chatStreams.delete(id), 3 * 60 * 1000);

  let messageDate: Date = new Date(date);
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
  const sessionKey = config?.sessionId ?? context.threadKey;
  try {
    const stream = await webapp_client.conat_client.streamAcp({
      project_id: context.project_id,
      prompt: workingInput,
      session_id: sessionKey,
      config: buildAcpConfig({
        path,
        config,
        model: normalizedModel,
      }),
      chat: chatMetadata,
    });
    for await (const message of stream) {
      // TODO: this is excess logging for development purposes
      console.log("ACP message", message);
      // when something goes wrong, the stream may send this sort of message:
      // {seq: 0, error: 'Error: ACP agent is already processing a request', type: 'error'}
      if (message?.type == "error") {
        throw Error(message.error);
      }
    }
  } catch (err) {
    chatStreams.delete(id);
    // set to the error message and stop generating
    let s = `${err}`;
    if (s.startsWith("Error: Error:")) {
      s = s.slice("Error: ".length);
    }
    saveHistory({ date }, s, sender_id, false);
    syncdb.commit();
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
  const sessionMode = resolveCodexSessionMode(config);
  opts.sessionMode = sessionMode;
  opts.allowWrite = sessionMode !== "read-only";
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
