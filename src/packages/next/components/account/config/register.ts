import { register as registerSearch } from "./search/entries";
import { IconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";

export const components: any = {};

interface Options {
  path: string;
  title?: string;
  icon?: IconName;
  desc?: string;
  Component: Function;
  danger?: boolean;
  search?: string | object;
}

export const menu: {
  [main: string]: {
    [sub: string]: {
      title: string;
      icon?: IconName;
      desc?: string;
      danger?: boolean;
    };
  };
} = {};

export default function register(opts: Options) {
  let { path, title, icon, desc, Component, danger, search } = opts;
  const [main, sub] = path.split("/");
  if(!title) {
    title = capitalize(sub);
  }
  if (!desc) {
    desc = '';
  }
  if (components[main] == null) {
    components[main] = { [sub]: Component };
  } else {
    components[main][sub] = Component;
  }
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
};
