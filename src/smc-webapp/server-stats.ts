/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Redux: server stats
*/

import { redux, Actions, Store } from "./app-framework";

type RecentTimes = "1d" | "1h" | "7d" | "30d";

interface StatsStoreState {
  loading?: boolean;
  hub_servers?: { clients: number }[];
  time?: Date;
  accounts?: number;
  projects?: number;
  accounts_created?: { [key in RecentTimes]: number };
  projects_created?: { [key in RecentTimes]: number };
  projects_edited?: { [key in RecentTimes]: number };
  files_opened?: {
    total: { [key in RecentTimes]: { [ext: string]: number } };
    distinct: { [key in RecentTimes]: { [ext: string]: number } };
  };
  running_projects?: {
    free: number;
    member: number;
  };
  kucalc?: string;
}

export class StatsStore extends Store<StatsStoreState> {}
export class StatsActions extends Actions<StatsStoreState> {}

const name = "server_stats";
redux.createStore(name, StatsStore, { loading: true } as StatsStoreState);
const actions = redux.createActions(name, StatsActions);

const { $ } = window as any;
import { BASE_URL } from "./misc";

function get_stats_once() {
  $.getJSON(`${BASE_URL}/stats`, function (data) {
    data.time = new Date(data.time);
    data.loading = false;
    actions.setState(data);
  });
}

function get_stats() {
  get_stats_once();
  setTimeout(get_stats, 90 * 1000);
}

get_stats();
