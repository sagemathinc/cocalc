import type { Message as MessageType } from "@cocalc/util/db-schema/messages";

export function isRead(message: MessageType) {
  return !!message.read?.valueOf();
}
