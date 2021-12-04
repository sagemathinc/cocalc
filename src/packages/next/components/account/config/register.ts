import { register as registerSearch } from "./search/entries";
import { IconName } from "@cocalc/frontend/components/icon";

export const components: any = {};

interface Options {
  path: string;
  title: string;
  icon: IconName;
  desc: string;
  Component: Function;
}

export const menu: { path: string; title: string; icon: IconName }[] = [];

export default function register(opts: Options) {
  const { path, title, icon, desc, Component } = opts;
  const [main, sub] = path.split("/");
  if (components[main] == null) {
    components[main] = { [sub]: Component };
  } else {
    components[main][sub] = Component;
  }
  if (desc) {
    registerSearch({ path, title, desc, icon });
  }
  menu.push({ path, title, icon });
}
