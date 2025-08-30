import { authFirst } from "./util";
import {
  type ApiMessagesGet,
  type MessageMe,
} from "@cocalc/util/db-schema/messages";

export interface Messages {
  send: (opts: {
    account_id?: string;
    to_ids: string[];
    // short plain text formatted subject
    subject: string;
    // longer markdown formatted body
    body: string;
    reply_id?: number;
  }) => Promise<any[]>;

  get: (opts: ApiMessagesGet) => Promise<MessageMe[]>;
}

export const messages = {
  send: authFirst,
  get: authFirst,
};
