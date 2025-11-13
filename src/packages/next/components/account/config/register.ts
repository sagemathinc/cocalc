/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { capitalize } from "@cocalc/util/misc";
import { register as registerSearch } from "./search/entries";

export const components: { [main: string]: { [sub: string]: Function } } = {};

interface Options {
  path: string;
  title?: string;
  icon?: IconName | "ai";
  desc?: string;
  Component: Function;
  danger?: boolean;
  search?: string | object;
}

interface Entry {
  title: string;
  icon?: IconName | "ai";
  desc?: string;
  danger?: boolean;
}

export const menu: {
  [main: string]: {
    [sub: string]: Entry;
  };
} = {};

export default function register(opts: Options) {
  const { path, icon, desc = "", Component, danger, search } = opts;
  const [main, sub] = path.split("/");
  const title = opts.title ?? capitalize(sub);

  if (components[main] == null) {
    components[main] = {};
  }
  components[main][sub] = Component;

  if (desc || search) {
    registerSearch({ path, title, desc, icon, search });
  }

  if (menu[main] == null) {
    menu[main] = {};
  }
  menu[main][sub] = { title, icon, desc, danger };
}

export const topIcons: { [key: string]: IconName } = {
  search: "search",
  account: "user",
  editor: "edit",
  system: "gear",
  licenses: "key",
  purchases: "credit-card",
  support: "support",
} as const;
