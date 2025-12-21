import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { AcpChatContext } from "@cocalc/conat/ai/acp/types";
import {
  DEFAULT_CODEX_MODELS,
  resolveCodexSessionMode,
  type CodexSessionConfig,
} from "@cocalc/util/ai/codex";
import { uuid } from "@cocalc/util/misc";
import type { ChatMessage } from "./types";
import type { CodexThreadConfig } from "@cocalc/chat";
import { dateValue } from "./access";
import { type ChatActions } from "./actions";

type QueueKey = string;
type QueueState = { running: boolean; items: Array<() => Promise<void>> };
const turnQueues: Map<QueueKey, QueueState> = new Map();

function getQueue(key: QueueKey): QueueState {
  let q = turnQueues.get(key);
  if (q == null) {
    q = { running: false, items: [] };
    turnQueues.set(key, q);
  }
  return q;
}

function makeQueueKey({ project_id, path, threadKey }): QueueKey {
  return `${project_id}::${path}::${threadKey}`;
}

async function runQueue(key: QueueKey): Promise<void> {
  const q = turnQueues.get(key);
  if (!q) return;
  const next = q.items.shift();
  if (!next) {
    q.running = false;
    if (q.items.length === 0) {
      turnQueues.delete(key);
    }
    return;
  }
  q.running = true;
  try {
    await next();
  } catch (err) {
    console.error("ACP turn queue job failed", err);
  } finally {
    void runQueue(key);
  }
}

type ProcessAcpRequest = {
  message: ChatMessage;
  model: string;
  input: string;
  actions: ChatActions;
  reply_to?: Date;
};

export async function processAcpLLM({
  message,
  model,
  input,
  actions,
  reply_to,
}: ProcessAcpRequest): Promise<void> {
  const { syncdb, store, chatStreams } = actions;
  if (syncdb == null || store == null) return;

  let workingInput = input?.trim();
  if (!workingInput) {
    return;
  }

  let baseDate: number;
  if (reply_to) {
    baseDate = reply_to.valueOf();
  } else {
    baseDate =
      message.date instanceof Date
        ? message.date.valueOf()
        : new Date(message.date ?? Date.now()).valueOf();
  }
  const threadKey: string | undefined = actions.computeThreadKey(baseDate);
  if (!threadKey) {
    return;
  }

  const sender_id = model || "openai-codex-agent";

  // Determine the thread root date from the message itself.
  // - For replies, `message.reply_to` is the thread root (ISO string).
  // - For a root message, the thread root is `message.date`.
  const messageDate = dateValue(message);
  if (!messageDate) {
    throw Error("invalid message");
  }
  const threadRootDate = message.reply_to
    ? new Date(message.reply_to)
    : messageDate;
  if (Number.isNaN(threadRootDate?.valueOf())) {
    throw new Error("ACP turn missing thread root date");
  }

  const config = actions.getCodexConfig?.(threadRootDate);
  const normalizedModel =
    typeof model === "string" ? normalizeCodexMention(model) : undefined;

  const id = uuid();
  chatStreams.add(id);
  // NOTE: the stream is ONLY used to submit the message for acp;
  // the actual resonse is via a pub/sub channel.  Thus this 3 minutes
  // is fine, even if the response is very long.
  setTimeout(() => chatStreams.delete(id), 3 * 60 * 1000);

  // Generate a stable assistant-reply key for this turn, but do NOT write any
  // corresponding chat row here. The backend is the sole writer of the assistant
  // reply row (avoids frontend/backend sync races on the same row).
  let newMessageDate = new Date();
  if (newMessageDate.valueOf() <= messageDate.valueOf()) {
    // ensure ai response message is after the message we're
    // responding to.
    newMessageDate = new Date(
      messageDate.valueOf() + Math.round(100 * Math.random()),
    );
  }

  const setState = (state) => {
    store.setState({
      acpState: store.get("acpState").set(`${messageDate.valueOf()}`, state),
    });
  };

  const project_id = store.get("project_id");
  const path = store.get("path");

  const chatMetadata = buildChatMetadata({
    project_id,
    path,
    sender_id,
    messageDate: newMessageDate,
    reply_to: threadRootDate,
  });
  const sessionKey = config?.sessionId ?? threadKey;
  const queueKey = makeQueueKey({ project_id, path, threadKey });
  const job = async (): Promise<void> => {
    try {
      setState("sending");
      console.log("Starting ACP turn for", { message, chatMetadata });
      const stream = await webapp_client.conat_client.streamAcp({
        project_id,
        prompt: workingInput,
        session_id: sessionKey,
        config: buildAcpConfig({
          path,
          config,
          model: normalizedModel,
        }),
        chat: chatMetadata,
      });
      setState("sent");
      console.log("Sent ACP turn request for", message);
      for await (const response of stream) {
        setState("running");
        // TODO: this is excess logging for development purposes
        console.log("ACP message response", response);
        // when something goes wrong, the stream may send this sort of message:
        // {seq: 0, error: 'Error: ACP agent is already processing a request', type: 'error'}
        if (response?.type == "error") {
          throw Error(response.error);
        }
      }
      console.log("ACP message responses done");
    } catch (err) {
      chatStreams.delete(id);
      console.error("ACP turn failed", err);
      // Backend owns the assistant reply row, but if we fail before the backend
      // can even start the turn (e.g., immediate stream error), we still want
      // the user to see *something* in the chat UI.
      try {
        const raw = `${err}`;
        const cleaned = raw.startsWith("Error: Error:")
          ? raw.slice("Error: ".length)
          : raw;
        actions.sendReply({
          message,
          reply: cleaned,
          from: sender_id,
          noNotification: true,
          reply_to: threadRootDate,
        });
        syncdb.commit();
      } catch (writeErr) {
        console.error("Failed to write ACP error reply", writeErr);
      }
    } finally {
      setState("");
    }
  };

  const q = getQueue(queueKey);
  q.items.push(job);
  setState("queue");
  if (!q.running) {
    void runQueue(queueKey);
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
  config?: CodexThreadConfig;
  model?: string;
}): CodexSessionConfig {
  const baseWorkingDir = resolveWorkingDir(path);
  const workingDirectory = config?.workingDirectory || baseWorkingDir;
  const opts: CodexSessionConfig = {
    workingDirectory,
  };
  const defaultModel = DEFAULT_CODEX_MODELS[0]?.name ?? "gpt-5.2-codex";
  const selectedModel = config?.model ?? model ?? defaultModel;
  if (selectedModel) {
    opts.model = selectedModel;
  }
  const modelInfo = DEFAULT_CODEX_MODELS.find((m) => m.name === selectedModel);
  const selectedReasoning =
    config?.reasoning ?? modelInfo?.reasoning?.find((r) => r.default)?.id;
  if (selectedReasoning) {
    if (["low", "medium", "high", "extra_high"].includes(selectedReasoning)) {
      opts.reasoning = selectedReasoning as CodexSessionConfig["reasoning"];
    } else {
      console.error(
        "Invalid Codex reasoning level; expected one of low|medium|high|extra_high:",
        selectedReasoning,
      );
    }
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
