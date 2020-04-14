/* Admin client functionality */

import * as message from "smc-util/message";

export class AdminClient {
  private async_call: Function;

  constructor(async_call: Function) {
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
    ban: boolean = true // if true, ban user  -- if false, unban them.
  ): Promise<void> {
    await this.async_call({
      message: message.admin_ban_user({
        account_id,
        ban,
      }),
      allow_post: true,
    });
  }
}
