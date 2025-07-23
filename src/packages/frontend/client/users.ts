/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { User } from "../frame-editors/generic/client";
import { isChatBot, chatBotName } from "@cocalc/frontend/account/chatbot";
import TTL from "@isaacs/ttlcache";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { WebappClient } from "./client";

const nameCache = new TTL({ ttl: 60 * 1000 });

export class UsersClient {
  private client: WebappClient;

  constructor(client) {
    this.client = client;
  }

  /*
  There are two possible item types in the query list: email addresses
  and strings that are not email addresses. An email query item will return
  account id, first name, last name, and email address for the unique
  account with that email address, if there is one. A string query item
  will return account id, first name, and last name for all matching
  accounts.

  We do not reveal email addresses of users queried by name to non admins.

  String query matches first and last names that start with the given string.
  If a string query item consists of two strings separated by space,
  the search will return accounts in which the first name begins with one
  of the two strings and the last name begins with the other.
  String and email queries may be mixed in the list for a single
  user_search call. Searches are case-insensitive.

  Note: there is a hard limit of 50 returned items in the results, except for
  admins that can search for more.
  */
  user_search = reuseInFlight(
    async ({
      query,
      limit = 20,
      admin,
      only_email,
    }: {
      query: string;
      limit?: number;
      admin?: boolean; // admins can do an admin version of the query, which also does substring searches on email address (not just name)
      only_email?: boolean; // search only via email address
    }): Promise<User[]> => {
      return await this.client.conat_client.hub.system.userSearch({
        query,
        limit,
        admin,
        only_email,
      });
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
        | {
            first_name: string;
            last_name: string;
            profile?: { color?: string; image?: string };
          }
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
      const names = await this.client.conat_client.hub.system.getNames(v);
      for (const account_id of v) {
        // iterate over v to record accounts that don't exist too
        x[account_id] = names[account_id];
        nameCache.set(account_id, names[account_id]);
      }
    }
    return x;
  });
}
