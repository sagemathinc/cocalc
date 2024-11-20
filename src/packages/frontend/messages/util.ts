import type { Message } from "@cocalc/util/db-schema/messages";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export function isRead(message: Message) {
  // by definition you have read anything you wrote.
  return !isNullDate(message.read) || isFromMe(message);
}

export function isNullDate(date: Date | number | undefined | null): boolean {
  return date == null || new Date(date).valueOf() == 0;
}

export function isFromMe(message: Message): boolean {
  return (
    message.from_type == "account" &&
    message.from_id == webapp_client.account_id
  );
}

export function isToMe(message: Message): boolean {
  return (
    message.to_type == "account" && message.to_id == webapp_client.account_id
  );
}
