/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This are two simple functions that you can use anywhere in code that make it easy to send
a message to any other user and also download all messages you have sent or received.
See @cocalc/util/db-schema/messages for definitions of parameters.

The interactive message UI interface uses a different way of getting messages
via synctables/changefeeds, so that it dynamically updates whenever anything
changes.

Messages also trigger (throttled) emails to people with a verified email account.

Ideas/Application for this:

- make it easy for an instructor to send a message to everybody in their course.

- make it easy for a student in a class to contact "course support", which will involve
  some special not-yet-implemented metadata on a message to track support progress.

- when some event happens, e.g., a computation completes, a message could be sent.

*/

import api from "./api";
import type { ApiMessagesGet, Message } from "@cocalc/util/db-schema/messages";

export class Messages {
  // Send a message to the given accounts.  Returns the id number of the message, which can be used
  // via reply_id to send followup messages in the same thread.
  send = async (opts): Promise<number> => {
    return await send(opts);
  };

  get = async (opts): Promise<Message[]> => {
    return await get(opts);
  };
}

export async function send({
  to_ids,
  subject,
  body,
  reply_id,
}: {
  // if to_ids is not given, then message is sent *to the user* themselves.  This can be useful
  // for various sort of alerts that can get backed by batched emails (e.g., my computation is done).
  to_ids?: string[];
  subject: string;
  body: string;
  reply_id?: number;
}): Promise<number> {
  const { id } = await api("/messages/send", {
    to_ids,
    subject,
    body,
    reply_id,
  });
  return id;
}

export async function get(opts: ApiMessagesGet): Promise<Message[]> {
  const { messages } = await api("/messages/get", opts);
  return messages;
}
