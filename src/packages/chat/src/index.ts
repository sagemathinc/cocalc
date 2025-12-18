export interface MessageHistory {
  author_id: string;
  content: string;
  date: string;
}

export interface ChatMessage {
  event: "chat";
  sender_id: string;
  history: MessageHistory[];
  date: Date | string;
  schema_version?: number;
  reply_to?: string;
  generating?: boolean;
  editing?: Record<string, "FUTURE" | null>;
  folding?: string[];
  feedback?: Record<string, unknown>;
  acp_events?: any[];
  acp_log_store?: string | null;
  acp_log_key?: string | null;
  acp_log_thread?: string | null;
  acp_log_turn?: string | null;
  acp_log_subject?: string | null;
  acp_thread_id?: string | null;
  acp_usage?: any;
  acp_config?: any;
  acp_account_id?: string;
}

export interface HistoryEntryInput {
  author_id: string;
  content: string;
  date?: string;
}

export function addToHistory(
  history: MessageHistory[] = [],
  entry: HistoryEntryInput,
): MessageHistory[] {
  const timestamp = entry.date ?? new Date().toISOString();
  const next: MessageHistory = {
    author_id: entry.author_id,
    content: entry.content,
    date: timestamp,
  };
  return [next, ...(history ?? [])];
}

export interface BuildChatMessageOptions {
  sender_id: string;
  date: Date | string;
  prevHistory: MessageHistory[] | undefined;
  content: string;
  generating: boolean;
  schema_version?: number;
  reply_to?: string;
  acp_events?: any[];
  acp_thread_id?: string | null;
  acp_usage?: any;
  historyAuthorId?: string;
  historyEntryDate?: string;
  acp_account_id?: string;
}

export function buildChatMessage(
  options: BuildChatMessageOptions,
): ChatMessage {
  const history = addToHistory(options.prevHistory ?? [], {
    author_id: options.historyAuthorId ?? options.sender_id,
    content: options.content,
    date: options.historyEntryDate,
  });

  const messageDate =
    options.date instanceof Date ? options.date : new Date(options.date);

  return {
    event: "chat",
    sender_id: options.sender_id,
    date: messageDate.toISOString(),
    history,
    generating: options.generating,
    reply_to: options.reply_to,
    schema_version: options.schema_version,
    acp_events: options.acp_events,
    acp_thread_id: options.acp_thread_id,
    acp_usage: options.acp_usage,
    acp_account_id: options.acp_account_id,
  };
}

export * from "./acp";
export * from "./acp-log";
