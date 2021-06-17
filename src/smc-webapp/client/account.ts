/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { callback } from "awaiting";
declare const $: any; // jQuery
import * as message from "smc-util/message";
import { AsyncCall, WebappClient } from "./client";

export class AccountClient {
  private async_call: AsyncCall;
  private client: WebappClient;
  private create_account_lock: boolean = false;

  constructor(client: WebappClient) {
    this.client = client;
    this.async_call = client.async_call;
  }

  private async call(message): Promise<any> {
    return await this.async_call({
      message,
      allow_post: false, // never works or safe for account related functionality
      timeout: 30, // 30s for all account stuff.
    });
  }

  public async create_account(opts: {
    first_name?: string;
    last_name?: string;
    email_address?: string;
    password?: string;
    agreed_to_terms?: boolean;
    usage_intent?: string;
    get_api_key?: boolean; // if given, will create/get api token in response message
    token?: string; // only required if an admin set the account creation token.
  }): Promise<any> {
    if (this.create_account_lock) {
      // don't allow more than one create_account message at once -- see https://github.com/sagemathinc/cocalc/issues/1187
      return message.account_creation_failed({
        reason: {
          account_creation_failed:
            "You are submitting too many requests to create an account; please wait a second.",
        },
      });
    }

    try {
      this.create_account_lock = true;
      return await this.call(message.create_account(opts));
    } finally {
      setTimeout(() => (this.create_account_lock = false), 1500);
    }
  }

  public async delete_account(account_id: string): Promise<any> {
    return await this.call(message.delete_account({ account_id }));
  }

  public async sign_in_using_auth_token(auth_token: string): Promise<any> {
    return await this.call(
      message.sign_in_using_auth_token({
        auth_token,
      })
    );
  }

  public async sign_in(opts: {
    email_address: string;
    password: string;
    remember_me?: boolean;
    get_api_key?: boolean; // if given, will create/get api token in response message
  }): Promise<any> {
    return await this.async_call({
      message: message.sign_in(opts),
      error_event: false,
    });
  }

  public async cookies(mesg): Promise<void> {
    const f = (cb) => {
      const j = $.ajax({
        url: mesg.url,
        data: { id: mesg.id, set: mesg.set, get: mesg.get, value: mesg.value },
      });
      j.done(() => cb());
      j.fail(() => cb("failed"));
    };
    await callback(f);
  }

  private async delete_remember_me_cookie(): Promise<void> {
    // This actually sets the content of the cookie to empty.
    // (I just didn't implement a delete action on the backend yet.)
    const base_path = window.app_base_path;
    const mesg = {
      url: join(base_path, "cookies"),
      set: base_path + "remember_me", // correct that there is no slash -- it's name of a cookie.
    };
    await this.cookies(mesg);
  }

  public async sign_out(everywhere: boolean = false): Promise<void> {
    await this.delete_remember_me_cookie();
    delete this.client.account_id;
    await this.call(message.sign_out({ everywhere }));
    this.client.emit("signed_out");
  }

  public async change_password(
    old_password: string,
    new_password: string = ""
  ): Promise<void> {
    if (this.client.account_id == null) {
      throw Error("must be signed in");
    }
    const x = await this.call(
      message.change_password({
        account_id: this.client.account_id,
        old_password,
        new_password,
      })
    );
    if (x.error) {
      throw Error(x.error);
    }
  }

  public async change_email(
    new_email_address: string,
    password: string = ""
  ): Promise<void> {
    if (this.client.account_id == null) {
      throw Error("must be logged in");
    }
    const x = await this.call(
      message.change_email_address({
        account_id: this.client.account_id,
        new_email_address,
        password,
      })
    );
    if (x.error) {
      throw Error(x.error);
    }
  }

  public async send_verification_email(
    only_verify: boolean = true
  ): Promise<void> {
    const account_id = this.client.account_id;
    if (!account_id) {
      throw Error("must be signed in to an account");
    }
    const x = await this.call(
      message.send_verification_email({
        account_id,
        only_verify,
      })
    );
    if (x.error) {
      throw Error(x.error);
    }
  }

  // forgot password -- send forgot password request to server
  public async forgot_password(email_address: string): Promise<void> {
    const x = await this.call(
      message.forgot_password({
        email_address,
      })
    );
    if (x.error) {
      throw Error(x.error);
    }
  }

  // forgot password -- send forgot password request to server
  public async reset_forgot_password(
    reset_code: string,
    new_password: string
  ): Promise<void> {
    const resp = await this.call(
      message.reset_forgot_password({
        reset_code,
        new_password,
      })
    );
    if (resp.error) {
      throw Error(resp.error);
    }
  }

  // forget about a given passport authentication strategy for this user
  public async unlink_passport(strategy: string, id: string): Promise<any> {
    return await this.call(
      message.unlink_passport({
        strategy,
        id,
      })
    );
  }

  // getting, setting, deleting, etc., the api key for this account
  public async api_key(
    action: "get" | "delete" | "regenerate",
    password: string
  ): Promise<string> {
    if (this.client.account_id == null) {
      throw Error("must be logged in");
    }
    return (
      await this.call(
        message.api_key({
          action,
          password,
        })
      )
    ).api_key;
  }
}
