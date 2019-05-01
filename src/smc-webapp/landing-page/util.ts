// Maybe should go in app-framework ... ?

import { redux } from "../app-framework";

export function actions(name: string): any {
  const a = redux.getActions(name);
  if (a == null) {
    throw Error(`actions "${name}" not available`);
  }
  return a;
}
