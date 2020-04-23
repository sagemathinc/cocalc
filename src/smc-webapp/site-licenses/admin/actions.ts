import { Map, Set } from "immutable";
import { Actions, redux, TypedMap } from "../../app-framework";
import {
  SiteLicensesState,
  SiteLicense,
  license_field_names,
  ManagerInfo,
} from "./types";
import { store } from "./store";
import {
  query,
  server_time,
  user_search,
} from "../../frame-editors/generic/client";
import { is_valid_uuid_string, uuid } from "smc-util/misc2";
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
    const search = store.get("search");
    if (!search) {
      // Empty search = clear
      this.setState({ site_licenses: [] });
      return;
    }
    try {
      this.setState({ loading: true });
      const x = await query({
        query: {
          matching_site_licenses: [
            {
              search,
              id: null,
              title: null,
              description: null,
              info: null,
              expires: null,
              activates: null,
              created: null,
              last_used: null,
              managers: null,
              restricted: null,
              upgrades: null,
              run_limit: null,
              apply_limit: null,
            },
          ],
        },
      });
      this.setState({ site_licenses: x.query.matching_site_licenses });
      await this.update_usage_stats();
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
          site_licenses: { id, created: now, last_used: now, activates: now },
        },
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
    // avoid confusion by restricting to only showing the
    // license being edited until user clears or changes search.
    // This makes UI technically less powerful but also less
    // confusing.
    this.set_search(license_id);
  }

  public cancel_editing(license_id: string): void {
    const editing = store.get("editing", Set()).delete(license_id);
    this.setState({ editing });
    const edits = store.get("edits");
    if (edits == null) return;
    this.setState({ edits: edits.delete(license_id) });
  }

  public start_saving(license_id: string): void {
    const saving = store.get("saving", Set()).add(license_id);
    this.setState({ saving });
  }

  public cancel_saving(license_id: string): void {
    const saving = store.get("saving", Set()).delete(license_id);
    this.setState({ saving });
  }

  public async save_editing(license_id: string): Promise<void> {
    const edits = store.get("edits");
    if (edits == null) return;
    try {
      this.start_saving(license_id);
      const changes = edits.get(license_id);
      if (changes == null || changes.size <= 1) return; // no actual changes
      let site_licenses = changes.toJS();
      if (site_licenses.upgrades) {
        normalize_upgrades_for_save(site_licenses.upgrades);
      }
      if (site_licenses.info != null) {
        try {
          site_licenses.info = JSON.parse(site_licenses.info);
        } catch (err) {
          this.set_error(`unable to parse JSON info field -- ${err}`);
          return;
        }
        // We have to set info differently since otherwise it gets deep
        // merged in.
      }
      if (site_licenses.run_limit) {
        const val = parseInt(site_licenses.run_limit);
        if (isNaN(val) || !isFinite(val) || val < 0) {
          this.set_error(
            `invalid value ${site_licenses.run_limit} for run limit`
          );
          return;
        }
        site_licenses.run_limit = val;
      }

      try {
        await query({
          query: {
            site_licenses,
          },
        });
      } catch (err) {
        this.set_error(err);
      }
      this.cancel_editing(license_id);
      await this.load();
    } finally {
      this.cancel_saving(license_id);
    }
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

  public show_projects(license_id: string, cutoff: Date | "now"): void {
    let show_projects = store.get("show_projects", Map<string, Date | "now">());
    show_projects = show_projects.set(license_id, cutoff);
    this.setState({ show_projects });
  }

  public hide_projects(license_id: string): void {
    let show_projects = store.get("show_projects", Map<string, Date | "now">());
    show_projects = show_projects.delete(license_id);
    this.setState({ show_projects });
  }

  public set_search(search: string): void {
    this.setState({ search });
  }

  public async update_usage_stats(): Promise<void> {
    try {
      const x = await query({
        query: { site_license_usage_stats: { running: null } },
      });
      this.setState({ usage_stats: x.query.site_license_usage_stats.running });
    } catch (err) {
      this.set_error(err);
    }
  }

  private async get_account_id(email_address_or_account_id): Promise<string> {
    if (is_valid_uuid_string(email_address_or_account_id)) {
      return email_address_or_account_id;
    }
    // lookup user by email address
    const x = await user_search({
      query: email_address_or_account_id,
      limit: 1,
      admin: true,
    });
    if (x.length == 0) {
      throw Error(
        `no user with email address '${email_address_or_account_id}'`
      );
    } else {
      return x[0].account_id;
    }
  }

  private async get_managers(id: string): Promise<string[]> {
    const managers = (
      await query({
        query: { site_licenses: { id, managers: null } },
      })
    ).query?.site_licenses?.managers;
    return managers ?? [];
  }

  private async set_managers(id: string, managers: string[]): Promise<void> {
    await query({
      query: { site_licenses: { id, managers } },
    });
  }

  public async add_manager(
    id: string,
    email_address_or_account_id: string
  ): Promise<void> {
    const managers: string[] = await this.get_managers(id);
    const account_id = await this.get_account_id(email_address_or_account_id);
    if (managers.indexOf(account_id) == -1) {
      managers.push(account_id);
    }
    await this.set_managers(id, managers);
  }

  public async remove_manager(
    id: string,
    email_address_or_account_id: string
  ): Promise<void> {
    const managers: string[] = await this.get_managers(id);
    const account_id = await this.get_account_id(email_address_or_account_id);
    const v = managers.filter((x) => x != account_id);
    if (v.length < managers.length) {
      await this.set_managers(id, v);
    }
  }

  public async show_manager_info(
    license_id: string,
    account_id: string | undefined
  ): Promise<void> {
    if (account_id == null) {
      this.setState({ manager_info: undefined });
      return;
    }
    let manager_info: ManagerInfo = Map({ license_id, account_id }) as any;
    this.setState({ manager_info });
    // also grab more info using admin powers, but don't block on this.
    const x = await user_search({ query: account_id, admin: true });
    if (x.length == 0) return;
    // make sure same info still
    if (store.getIn(["manager_info", "account_id"]) == account_id) {
      for (const field of [
        "first_name",
        "last_name",
        "last_active",
        "created",
        "banned",
        "email_address",
      ]) {
        // TODO: I'm being typescript lazy here.
        manager_info = manager_info.set(field as any, x[0][field]) as any;
      }
      this.setState({ manager_info });
    }
  }
}

export const actions = redux.createActions(
  "admin-site-licenses",
  SiteLicensesActions
);
