import { Map, Set } from "immutable";
import { Actions, redux, TypedMap } from "../../app-framework";
import { SiteLicensesState, SiteLicense, license_field_names } from "./types";
import { store } from "./store";
import { query, server_time } from "../../frame-editors/generic/client";
import { uuid } from "smc-util/misc2";
import { normalize_upgrades_for_save } from "./upgrades";

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
        query: {
          site_licenses: { id, created: now, last_used: now, activates: now }
        }
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

  public cancel_editing(license_id: string): void {
    const editing = store.get("editing", Set()).delete(license_id);
    this.setState({ editing });
    const edits = store.get("edits");
    if (edits == null) return;
    this.setState({ edits: edits.delete(license_id) });
  }

  public async save_editing(license_id: string): Promise<void> {
    const edits = store.get("edits");
    this.cancel_editing(license_id);
    if (edits == null) return;
    const changes = edits.get(license_id);
    if (changes == null || changes.size <= 1) return; // no actual changes
    let site_licenses = changes.toJS();
    for (const field of ["upgrades", "student_upgrades"]) {
      if (!site_licenses[field]) continue;
      normalize_upgrades_for_save(site_licenses[field]);
    }

    try {
      await query({
        query: {
          site_licenses
        }
      });
    } catch (err) {
      this.set_error(err);
    }
    await this.load();
  }

  public set_edit(
    license_id: string,
    field: license_field_names,
    value: any
  ): void {
    let edits: Map<string, TypedMap<SiteLicense>> = store.get("edits", Map());
    let y = edits.get(license_id, Map({ id: license_id }));
    y = y.set(field, value);
    edits = edits.set(license_id, y as TypedMap<SiteLicense>);
    this.setState({ edits });
  }
}

export const actions = redux.createActions(
  "admin-site-licenses",
  SiteLicensesActions
);
