/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";
import api from "./api";

export class AdminClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  public async admin_reset_password(email_address: string): Promise<string> {
    return (
      await this.async_call({
        message: message.admin_reset_password({
          email_address,
        }),
        allow_post: true,
      })
    ).link;
  }

  public async admin_ban_user(
    account_id: string,
    ban: boolean = true, // if true, ban user  -- if false, remove ban
  ): Promise<void> {
    if (ban) {
      await api("/accounts/ban", { account_id });
    } else {
      await api("/accounts/remove-ban", { account_id });
    }
  }

  public async get_user_auth_token(account_id: string): Promise<string> {
    return (
      await this.async_call({
        message: message.user_auth({ account_id, password: "" }),
        allow_post: false,
      })
    ).auth_token;
  }
}
