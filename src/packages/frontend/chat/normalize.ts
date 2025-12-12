import type { PlainChatMessage } from "./types";

export const CURRENT_CHAT_MESSAGE_VERSION = 1;

export interface NormalizedChatMessage {
  message?: PlainChatMessage;
  upgraded: boolean;
}

/**
 * Normalize a chat record coming from syncdb (plain JS) into a consistent shape.
 * Ensures date is a Date instance and legacy payload/mesg fields are converted
 * into a history entry. Adds empty defaults and stamps schema_version.
 */
export function normalizeChatMessage(base: any): NormalizedChatMessage {
  if (!base || base.event !== "chat")
    return { message: undefined, upgraded: false };
  // Drop legacy video chat payloads
  if (base.video_chat?.is_video_chat)
    return { message: undefined, upgraded: false };

  // Work on a shallow copy so we never mutate readonly/frozen inputs.
  const x = { ...base };
  let upgraded = false;

  // Coerce date -- this is a normalization -- the raw date is always an iso string.
  if (!(x.date instanceof Date)) {
    x.date = new Date(x.date);
  }
  if (x.schema_version == CURRENT_CHAT_MESSAGE_VERSION) {
    return { message: x as PlainChatMessage, upgraded: false };
  }

  // Patch legacy payload/mesg shapes into history
  if ((x.history?.length ?? 0) === 0) {
    if (x.payload?.content != null) {
      x.history = [
        {
          content: x.payload.content,
          author_id: x.sender_id,
          date: new Date(x.date).toISOString(),
        },
      ];
      delete x.payload;
      upgraded = true;
    } else if (x.mesg?.content != null) {
      x.history = [
        {
          content: x.mesg.content,
          author_id: x.sender_id,
          date: new Date(x.date).toISOString(),
        },
      ];
      delete x.mesg;
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

  return { message: x as PlainChatMessage, upgraded };
}
