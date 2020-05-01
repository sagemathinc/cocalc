/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { replace_all } from "smc-util/misc2";
import * as message from "smc-util/message";
import { AsyncCall } from "./client";

export class SupportTickets {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  private async call(message: object): Promise<any> {
    return await this.async_call({ message, timeout: 30 });
  }

  public async create(opts): Promise<string> {
    if (opts.body != null) {
      // Make it so the session is ignored in any URL appearing in the body.
      // Obviously, this is not 100% bullet proof, but should help enormously.
      opts.body = replace_all(opts.body, "?session=", "?session=#");
    }
    return (await this.call(message.create_support_ticket(opts))).url;
  }

  public async get(): Promise<any> {
    return (await this.call(message.get_support_tickets())).tickets;
  }
}
