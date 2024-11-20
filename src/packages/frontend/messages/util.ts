import type { Message } from "@cocalc/util/db-schema/messages";

export function isRead(message: Message) {
  return !isNullDate(message.read);
}

export function isNullDate(date: Date | number | undefined | null): boolean {
  return date == null || new Date(date).valueOf() == 0;
}
