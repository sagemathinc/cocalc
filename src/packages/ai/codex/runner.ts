import {
  Codex,
  Thread,
  type CodexOptions,
  type Input,
  type RunResult,
  type ThreadEvent,
  type ThreadOptions,
  type TurnOptions,
  type Usage,
  type AgentMessageItem,
  type ThreadItem,
} from "@openai/codex-sdk";

export interface CodexThreadRunnerOptions {
  codex?: Codex;
  codexOptions?: CodexOptions;
  resumeThreadId?: string;
  threadOptions?: ThreadOptions;
}

export interface CodexStreamOptions {
  input: Input;
  turnOptions?: TurnOptions;
  onEvent?: (event: ThreadEvent) => void;
}

export interface CodexStreamResult {
  events: ThreadEvent[];
  finalResponse: string;
  usage: Usage | null;
  threadId: string | null;
}

export class CodexRunError extends Error {
  constructor(message: string, readonly event?: ThreadEvent) {
    super(message);
    this.name = "CodexRunError";
  }
}

function isAgentMessage(item: ThreadItem): item is AgentMessageItem {
  return item?.type === "agent_message";
}

function handleTerminalEvent(event: ThreadEvent): never {
  if (event.type === "turn.failed") {
    throw new CodexRunError(event.error?.message ?? "Codex turn failed", event);
  }
  if (event.type === "error") {
    throw new CodexRunError(event.message ?? "Codex stream error", event);
  }
  throw new CodexRunError("Codex stream terminated unexpectedly", event);
}

export class CodexThreadRunner {
  private readonly codex: Codex;
  private readonly thread: Thread;

  constructor(options: CodexThreadRunnerOptions = {}) {
    this.codex = options.codex ?? new Codex(options.codexOptions);
    this.thread = options.resumeThreadId
      ? this.codex.resumeThread(options.resumeThreadId, options.threadOptions)
      : this.codex.startThread(options.threadOptions);
  }

  get id(): string | null {
    return this.thread.id;
  }

  async run(input: Input, turnOptions?: TurnOptions): Promise<RunResult> {
    return this.thread.run(input, turnOptions);
  }

  async runStreamed(options: CodexStreamOptions): Promise<CodexStreamResult> {
    const { events } = await this.thread.runStreamed(
      options.input,
      options.turnOptions,
    );

    const collected: ThreadEvent[] = [];
    let finalResponse = "";
    let usage: Usage | null = null;

    try {
      for await (const event of events) {
        collected.push(event);
        options.onEvent?.(event);
        switch (event.type) {
          case "item.completed":
            if (isAgentMessage(event.item)) {
              finalResponse = event.item.text ?? finalResponse;
            }
            break;
          case "turn.completed":
            usage = event.usage;
            break;
          case "turn.failed":
          case "error":
            handleTerminalEvent(event);
            break;
          default:
            break;
        }
      }
    } catch (err) {
      throw err;
    }

    return {
      events: collected,
      finalResponse,
      usage,
      threadId: this.thread.id,
    };
  }
}
