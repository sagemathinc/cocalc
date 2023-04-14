/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

import {
  Actions,
  Store,
  Table,
  TypedMap,
  redux,
} from "@cocalc/frontend/app-framework";
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

  public markNewsRead(date?: Date): void {
    const newest: number = // javascript epoch timestamp in milliseconds
      date == null ? this.getStore().getNewestTimestamp() : date.getTime();
    const account_actions = redux.getActions("account");
    account_actions.set_other_settings("news_read_until", newest);
  }

  public markNewsUnread(): void {
    const account_actions = redux.getActions("account");
    account_actions.set_other_settings("news_read_until", 0);
  }

  public updateUnreadCount(readUntil: number): void {
    let unread = 0;
    this.getStore()
      .getNews()
      .map((m, _id) => {
        //console.log("news change:", _id, m.toJS());
        const date = m.get("date");
        if (date != null && date.getTime() > readUntil) {
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
    actions.setState({
      loading: false,
      news: data.get(),
    });
  }
}

let table: NewsTable | undefined = undefined;

if (!COCALC_MINIMAL) {
  table = redux.createTable(NEWS, NewsTable);
}

export function getTable() {
  return table;
}
