import { Set } from "immutable";
import { Actions, redux } from "../../app-framework";
import { SiteLicensesState } from "./types";
import { store } from "./store";
import { query, server_time } from "../../frame-editors/generic/client";
import { uuid } from "smc-util/misc2";

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
              title: null,
              description: null,
              expires: null,
              activates: null,
              created: null,
              last_used: null,
              users: null,
              restricted: null,
              upgrades: null,
              student_upgrades: null,
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

  public async create_new_license(): Promise<void> {
    const id = uuid();
    try {
      this.setState({ creating: true });
      const now = server_time();
      await query({
        query: { site_licenses: { id, created: now, last_used: now } }
      });
      await this.load(); // so will have the new license
      this.start_editing(id);
    } catch (err) {
      this.set_error(err);
    } finally {
      this.setState({ creating: false });
    }
  }

  public start_editing(license_id: string): void {
    const editing = store.get("editing", Set()).add(license_id);
    this.setState({ editing });
  }

  public done_editing(license_id: string): void {
    const editing = store.get("editing", Set()).delete(license_id);
    this.setState({ editing });
  }
}

export const actions = redux.createActions(
  "admin-site-licenses",
  SiteLicensesActions
);
