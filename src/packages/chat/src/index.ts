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
  reply_to?: string;
  generating?: boolean;
  editing?: Record<string, "FUTURE" | null>;
  folding?: string[];
  feedback?: Record<string, unknown>;
  acp_events?: any[];
  acp_thread_id?: string | null;
  acp_usage?: any;
  acp_config?: any;
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
  reply_to?: string;
  acp_events?: any[];
  acp_thread_id?: string | null;
  acp_usage?: any;
  historyAuthorId?: string;
  historyEntryDate?: string;
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
    date: messageDate,
    history,
    generating: options.generating,
    reply_to: options.reply_to,
    acp_events: options.acp_events,
    acp_thread_id: options.acp_thread_id,
    acp_usage: options.acp_usage,
  };
}

export * from "./acp";
