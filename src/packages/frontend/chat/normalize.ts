import type { ChatMessage } from "./types";

export const CURRENT_CHAT_MESSAGE_VERSION = 1;

export interface NormalizedChatMessage {
  message?: ChatMessage;
  upgraded: boolean;
}

/**
 * Normalize a chat record coming from syncdb (plain JS) into a consistent shape.
 * Ensures date is a Date instance and legacy payload/mesg fields are converted
 * into a history entry. Adds empty defaults and stamps schema_version.
 */
export function normalizeChatMessage(raw: any): NormalizedChatMessage {
  if (!raw || raw.event !== "chat") return { message: undefined, upgraded: false };
  // Drop legacy video chat payloads
  if ((raw as any).video_chat?.is_video_chat) return { message: undefined, upgraded: false };

  // Work on a shallow copy so we never mutate readonly/frozen inputs.
  const x: any = { ...raw };
  let upgraded = false;

  // Coerce date
  if (!(x.date instanceof Date)) {
    x.date = new Date(x.date);
    upgraded = true;
  }

  // Patch legacy payload/mesg shapes into history
  if ((x.history?.length ?? 0) === 0) {
    if ((x as any).payload?.content != null) {
      x.history = [
        {
          content: (x as any).payload.content,
          author_id: x.sender_id,
          date: new Date(x.date).toISOString(),
        },
      ];
      delete (x as any).payload;
      upgraded = true;
    } else if ((x as any).mesg?.content != null) {
      x.history = [
        {
          content: (x as any).mesg.content,
          author_id: x.sender_id,
          date: new Date(x.date).toISOString(),
        },
      ];
      delete (x as any).mesg;
      upgraded = true;
    }
  }

  if (x.history == null) {
    x.history = [];
    upgraded = true;
  }
  if (!x.editing) {
    x.editing = {};
    upgraded = true;
  }
  if (!x.folding) {
    x.folding = [];
    upgraded = true;
  }
  if (!x.feedback) {
    x.feedback = {};
    upgraded = true;
  }

  const prevVersion =
    typeof x.schema_version === "number" ? x.schema_version : 0;
  if (prevVersion !== CURRENT_CHAT_MESSAGE_VERSION) {
    x.schema_version = CURRENT_CHAT_MESSAGE_VERSION;
    upgraded = true;
  }

  return { message: x as ChatMessage, upgraded };
}
