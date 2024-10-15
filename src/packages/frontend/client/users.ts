/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { AsyncCall } from "./client";
import { User } from "../frame-editors/generic/client";
import { isChatBot, chatBotName } from "@cocalc/frontend/account/chatbot";
import api from "./api";
import TTL from "@isaacs/ttlcache";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import * as message from "@cocalc/util/message";

const nameCache = new TTL({ ttl: 60 * 1000 });

export class UsersClient {
  private async_call: AsyncCall;

  constructor(_call: Function, async_call: AsyncCall) {
    this.async_call = async_call;
  }

  user_search = reuseInFlight(
    async (opts: {
      query: string;
      limit?: number;
      active?: string; // if given, would restrict to users active this recently
      admin?: boolean; // admins can do an admin version of the query, which also does substring searches on email address (not just name)
      only_email?: boolean; // search only via email address
    }): Promise<User[]> => {
      if (opts.limit == null) opts.limit = 20;
      if (opts.active == null) opts.active = "";

      const { results } = await this.async_call({
        message: message.user_search({
          query: opts.query,
          limit: opts.limit,
          admin: opts.admin,
          active: opts.active,
          only_email: opts.only_email
        }),
      });
      return results;
    },
  );

  // Gets username with given account_id.   We use caching and aggregate to
  // makes it so this never calls to the backend more than once at a time
  // (per minute) for a given account_id.
  get_username = reuseInFlight(
    async (
      account_id: string,
    ): Promise<{ first_name: string; last_name: string }> => {
      if (isChatBot(account_id)) {
        return { first_name: chatBotName(account_id), last_name: "" };
      }
      const v = await this.getNames([account_id]);
      const u = v[account_id];
      if (u == null) {
        throw Error(`no user with account_id ${account_id}`);
      }
      return u;
    },
  );

  // get map from account_id to first_name, last_name (or undefined if no account); cached
  // for about a minute client side.
  getNames = reuseInFlight(async (account_ids: string[]) => {
    const x: {
      [account_id: string]:
        | { first_name: string; last_name: string }
        | undefined;
    } = {};
    const v: string[] = [];
    for (const account_id of account_ids) {
      if (nameCache.has(account_id)) {
        x[account_id] = nameCache.get(account_id);
      } else {
        v.push(account_id);
      }
    }
    if (v.length > 0) {
      const { names } = await api("/accounts/get-names", { account_ids: v });
      for (const account_id of v) {
        // iterate over v to record accounts that don't exist too
        x[account_id] = names[account_id];
        nameCache.set(account_id, names[account_id]);
      }
    }
    return x;
  });
}
