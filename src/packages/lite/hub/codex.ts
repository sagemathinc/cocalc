/*
DEVEL:

The following will output a bunch of messages from codex, if you
have it already setup and running locally on your computer:

a = require('@cocalc/lite/hub/codex')

a.evaluate({stream:console.log, input:'Say hello from Codex!',thread_options: {workingDirectory:'/tmp',skipGitRepoCheck: true}})


a.evaluate({
stream:console.log, 
    account_id: '00000000-1000-4000-8000-000000000001',
    input: 'Say hello from Codex!',
    thread_options: { workingDirectory: '/tmp', skipGitRepoCheck: true }
  })

*/

import {
  CodexThreadRunner,
  type ThreadEvent as SdkThreadEvent,
  type AgentMessageItem as SdkAgentMessage,
} from "@cocalc/ai/codex";
import { init as initConatCodex } from "@cocalc/conat/codex/server";
import type {
  CodexRequest,
  CodexStreamPayload,
  ThreadEvent as ConatThreadEvent,
  AgentMessageItem as ConatAgentMessage,
} from "@cocalc/conat/codex/types";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("lite:hub:codex");

function withDefaults(
  options: CodexRequest["thread_options"],
): CodexRequest["thread_options"] {
  const workingDirectory = options?.workingDirectory ?? process.cwd();
  return {
    skipGitRepoCheck: true,
    ...options,
    workingDirectory,
  };
}

function normalizeEvent(event: SdkThreadEvent): ConatThreadEvent {
  return event as unknown as ConatThreadEvent;
}

function normalizeAgentMessage(
  item?: SdkAgentMessage,
): ConatAgentMessage | undefined {
  if (item == null) return undefined;
  return {
    id: item.id,
    type: "agent_message",
    text: item.text,
  };
}

function lastAgentMessage(events: SdkThreadEvent[]) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (
      event.type === "item.completed" &&
      event.item?.type === "agent_message"
    ) {
      return event.item;
    }
  }
  return undefined;
}

export async function evaluate({
  stream,
  ...request
}: CodexRequest & {
  stream: (payload?: CodexStreamPayload | null) => Promise<void>;
}) {
  logger.debug("evaluate ", { request }, process.env);
  const runner = new CodexThreadRunner({
    codexOptions: {
      ...request.codex_options,
      env: {
        ...process.env,
        HOME: process.env.COCALC_ORIGINAL_HOME ?? process.env.HOME ?? "",
        PATH: process.env.COCALC_ORIGINAL_PATH ?? process.env.PATH ?? "",
      },
      codexPathOverride: request.codex_options?.codexPathOverride as
        | string
        | undefined,
    },
    resumeThreadId: request.thread_id ?? undefined,
    threadOptions: withDefaults(request.thread_options),
  });

  const result = await runner.runStreamed({
    input: request.input,
    turnOptions: request.turn_options,
    onEvent: async (event) => {
      await stream({ type: "event", event: normalizeEvent(event) });
    },
  });

  await stream({
    type: "summary",
    finalResponse: result.finalResponse,
    usage: result.usage,
    threadId: result.threadId,
    lastMessage: normalizeAgentMessage(lastAgentMessage(result.events)),
  });
}

export async function init(): Promise<void> {
  await initConatCodex(evaluate);
}
