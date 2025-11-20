export type CodexOptions = Record<string, unknown>;
export type ThreadOptions = Record<string, unknown>;
export type TurnOptions = Record<string, unknown>;
export type TextInput = {
  type: "text";
  text: string;
};

export type ImageInput = {
  type: "local_image";
  path: string;
};

export type UserInput = TextInput | ImageInput;

export type Input = string | UserInput[];

export type Usage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

export type AgentMessageItem = {
  id?: string;
  type: "agent_message";
  text?: string;
};

export type ThreadItem =
  | AgentMessageItem
  | Record<string, any>;

export type ThreadEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: Usage }
  | { type: "turn.failed"; error?: { message?: string } }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem }
  | { type: "error"; message?: string };

export type RunResult = {
  items: ThreadItem[];
  finalResponse: string;
  usage: Usage | null;
};

export interface CodexRequest {
  account_id: string;
  input: Input;
  thread_options?: ThreadOptions;
  project_id?: string;
  thread_id?: string | null;
  turn_options?: TurnOptions;
  codex_options?: CodexOptions;
}

export interface CodexEventPayload {
  type: "event";
  event: ThreadEvent;
}

export interface CodexSummaryPayload {
  type: "summary";
  finalResponse: string;
  usage: Usage | null;
  threadId: string | null;
  lastMessage?: AgentMessageItem;
}

export interface CodexErrorPayload {
  type: "error";
  error: string;
}

export type CodexStreamPayload =
  | CodexEventPayload
  | CodexSummaryPayload
  | CodexErrorPayload;

export type CodexStreamMessage = CodexStreamPayload & { seq: number };
