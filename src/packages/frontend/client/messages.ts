/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import api from "./api";

export class Messages {
  // Send a message to the given accounts.  Returns the id number of the message, which can be used
  // via reply_to to send followup messages in the same thread.
  send = async (opts): Promise<number> => {
    return await send(opts);
  };
}

export async function send({
  to_ids,
  subject,
  body,
  reply_to,
}: {
  to_ids: string[];
  subject: string;
  body: string;
  reply_to?: number;
}): Promise<number> {
  const { id } = await api("/send-message", {
    to_ids,
    subject,
    body,
    reply_to,
  });
  return id;
}
