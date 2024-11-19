import type { Message as MessageType } from "@cocalc/util/db-schema/messages";

export function isRead(message: MessageType) {
  return !isNullDate(message.read);
}

export function isNullDate(date: Date | number | undefined | null): boolean {
  return date == null || new Date(date).valueOf() == 0;
}
