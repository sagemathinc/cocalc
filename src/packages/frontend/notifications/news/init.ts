/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import {
  Actions,
  Store,
  Table,
  TypedMap,
  redux,
} from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COCALC_MINIMAL } from "@cocalc/frontend/fullscreen";
import { NewsItemWebapp } from "@cocalc/util/types/news";

export const NEWS = "news";

export interface NewsState {
  loading: boolean;
  unread: number;
  news: Map<string, TypedMap<NewsItemWebapp>>;
}

export class NewsStore extends Store<NewsState> {
  // returns the newest timestamp of all news items as an epoch timestamp in milliseconds
  public getNewestTimestamp(): number {
    const news = this.get("news");
    if (news == null) {
      return 0;
    }
    let newest = 0;
    news.map((m) => {
      const date = m.get("date")?.getTime();
      if (date && date > newest) {
        newest = date;
      }
    });
    return newest;
  }

  public getNews(): NewsState["news"] {
    return this.get("news");
  }
}

const store: NewsStore = redux.createStore(NEWS, NewsStore, {
  loading: true,
  unread: 0,
  news: Map<string, TypedMap<NewsItemWebapp>>(),
});

export class NewsActions extends Actions<NewsState> {
  public getStore(): NewsStore {
    return store;
  }

  public markNewsRead(opts?: { date?: Date; current?: number }): void {
    // javascript epoch timestamp in milliseconds
    const newest: number =
      opts?.date?.getTime() ?? this.getStore().getNewestTimestamp();
    const current = opts?.current ?? 0;
    // Math.max, because clicking on a slightly older item shouldn't make newer ones unread
    const until = Math.max(current, newest);
    const account_actions = redux.getActions("account");
    account_actions.set_other_settings("news_read_until", until);
  }

  public markNewsUnread(): void {
    const account_actions = redux.getActions("account");
    account_actions.set_other_settings("news_read_until", 0);
  }

  public updateUnreadCount(readUntil: number): void {
    let unread = 0;
    const now = webapp_client.server_time();
    const account_created = redux.getStore("account")?.get("created");
    this.getStore()
      .getNews()
      .map((m, _id) => {
        if (m.get("hide", false)) return;
        const date = m.get("date");
        if (date != null && date.getTime() > readUntil && date < now) {
          // further filter news, which are older then when the user's account has been created
          // if they open the news panel, they'll still see them, though – but initially there is no notification
          if (account_created && date < account_created) return;
          unread++;
        }
      });
    actions.setState({ unread });
  }
}

const actions = redux.createActions(NEWS, NewsActions);

class NewsTable extends Table {
  public query(): string {
    return "news";
  }

  protected _change(data, _keys): void {
    //console.log("news/change: data=", data.get()?.toJS());
    actions.setState({
      loading: false,
      news: data.get(),
    });
    const readUntil = redux
      .getStore("account")
      ?.getIn(["other_settings", "news_read_until"]);
    actions.updateUnreadCount(readUntil);
  }
}

let table: NewsTable | undefined = undefined;

if (!COCALC_MINIMAL) {
  table = redux.createTable(NEWS, NewsTable);
}

export function getTable() {
  return table;
}
