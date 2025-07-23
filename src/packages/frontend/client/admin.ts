/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { WebappClient } from "./client";
import api from "./api";

export class AdminClient {
  private client: WebappClient;

  constructor(client: WebappClient) {
    this.client = client;
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

  public async get_user_auth_token(user_account_id: string): Promise<string> {
    return await this.client.conat_client.hub.system.generateUserAuthToken({
      user_account_id,
    });
  }
}
