/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback } from "awaiting";
declare const $: any; // jQuery
import * as message from "@cocalc/util/message";
import { AsyncCall, WebappClient } from "./client";
import type { ApiKey } from "@cocalc/util/db-schema/api-keys";
import api from "./api";

export class AccountClient {
  private async_call: AsyncCall;
  private client: WebappClient;
  private create_account_lock: boolean = false;

  constructor(client: WebappClient) {
    this.client = client;
    this.async_call = client.async_call;
  }

  private call = async (message): Promise<any> => {
    return await this.async_call({
      message,
      allow_post: false, // never works or safe for account related functionality
      timeout: 30, // 30s for all account stuff.
    });
  };

  create_account = async (opts: {
    first_name?: string;
    last_name?: string;
    email_address?: string;
    password?: string;
    agreed_to_terms?: boolean;
    usage_intent?: string;
    get_api_key?: boolean; // if given, will create/get api token in response message
    token?: string; // only required if an admin set the account creation token.
  }): Promise<any> => {
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
  };

  cookies = async (mesg): Promise<void> => {
    const f = (cb) => {
      const j = $.ajax({
        url: mesg.url,
        data: { id: mesg.id, set: mesg.set, get: mesg.get, value: mesg.value },
      });
      j.done(() => cb());
      j.fail(() => cb("failed"));
    };
    await callback(f);
  };

  sign_out = async (everywhere: boolean = false): Promise<void> => {
    await api("/accounts/sign-out", { all: everywhere });
    delete this.client.account_id;
    this.client.emit("signed_out");
  };

  change_password = async (
    currentPassword: string,
    newPassword: string = "",
  ): Promise<void> => {
    await api("/accounts/set-password", { currentPassword, newPassword });
  };

  change_email = async (
    new_email_address: string,
    password: string = "",
  ): Promise<void> => {
    if (this.client.account_id == null) {
      throw Error("must be logged in");
    }
    await api("accounts/set-email-address", {
      email_address: new_email_address,
      password,
    });
  };

  send_verification_email = async (
    only_verify: boolean = true,
  ): Promise<void> => {
    const account_id = this.client.account_id;
    if (!account_id) {
      throw Error("must be signed in to an account");
    }
    const x = await this.call(
      message.send_verification_email({
        account_id,
        only_verify,
      }),
    );
    if (x.error) {
      throw Error(x.error);
    }
  };

  // forget about a given passport authentication strategy for this user
  unlink_passport = async (strategy: string, id: string): Promise<any> => {
    return await this.call(
      message.unlink_passport({
        strategy,
        id,
      }),
    );
  };

  // new interface: getting, setting, editing, deleting, etc., the  api keys for a project
  api_keys = async (opts: {
    action: "get" | "delete" | "create" | "edit";
    password?: string;
    name?: string;
    id?: number;
    expire?: Date;
  }): Promise<ApiKey[] | undefined> => {
    return await this.client.conat_client.hub.system.manageApiKeys(opts);
  };
}
