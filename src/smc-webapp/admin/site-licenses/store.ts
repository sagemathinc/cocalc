import { Store, redux } from "../../app-framework";
import { SiteLicensesState } from "./types";

export class SiteLicensesStore extends Store<SiteLicensesState> {}

export const store = redux.createStore(
  "admin-site-licenses",
  SiteLicensesStore,
  {}
);
