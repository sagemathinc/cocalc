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
import { NewTypeWebapp } from "@cocalc/util/types/news";

const NEWS = "news";

export interface NewsState {
  loading: boolean;
  unread: number;
  news: Map<string, TypedMap<NewTypeWebapp>>;
}

export class NewsStore extends Store<NewsState> {}

const store: NewsStore = redux.createStore(NEWS, NewsStore, {
  loading: true,
  unread: 0,
  news: Map<string, TypedMap<NewTypeWebapp>>(),
});

export class NewsActions extends Actions<NewsState> {
  getStore(): NewsStore {
    return store;
  }
}

const actions = redux.createActions(NEWS, NewsActions);

class NewsTable extends Table {
  public query(): string {
    return "news";
  }

  protected _change(data, _keys): void {
    const account_store = redux.getStore("account");
    const readUntil = new Date(
      1000 * (account_store?.get("newsReadUntil") ?? 0)
    );

    console.log(store)

    actions.setState({
      loading: false,
      news: data.get(),
    });

    let unread = 0;
    data.get().map((m, id) => {
      console.log("news change:", id, m.toJS());
      if (m.get("date") > readUntil) {
        unread++;
      }
    });
    console.log("readUntil", readUntil, "unread news:", unread);
    actions.setState({ unread });
  }
}

let table: NewsTable | undefined = undefined;

if (!COCALC_MINIMAL) {
  table = redux.createTable(NEWS, NewsTable);
}

export function getTable() {
  return table;
}
