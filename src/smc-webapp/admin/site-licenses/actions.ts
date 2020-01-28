import { Actions, redux } from "../../app-framework";
import { SiteLicensesState } from "./types";
import { store } from "./store";
import { query } from "../../frame-editors/generic/client";

export class SiteLicensesActions extends Actions<SiteLicensesState> {
  public set_error(error: any): void {
    this.setState({ error: `${error}` });
  }

  public set_view(view: boolean): void {
    this.setState({ view });
    if (view && store.get("site_licenses") == null && !store.get("loading")) {
      this.load();
    }
  }

  public async load(): Promise<void> {
    if (store.get("loading")) return;
    try {
      this.setState({ loading: true });
      const x = await query({
        query: {
          site_licenses: [
            {
              id: null,
              name: null,
              expires: null,
              activates: null,
              created: null,
              last_active: null,
              admins: null,
              restricted: null,
              upgrades: null,
              run_limit: null,
              apply_limit: null
            }
          ]
        }
      });
      this.setState({ site_licenses: x.query.site_licenses });
    } catch (err) {
      this.set_error(err);
    } finally {
      this.setState({ loading: false });
    }
  }
}

export const actions = redux.createActions(
  "admin-site-licenses",
  SiteLicensesActions
);
