import { Map, Set } from "immutable";
import { Actions, redux, TypedMap } from "../../app-framework";
import { SiteLicensesState, SiteLicense, license_field_names } from "./types";
import { store } from "./store";
import { query, server_time } from "../../frame-editors/generic/client";
import { uuid } from "smc-util/misc2";
import { search_split, search_match } from "smc-util/misc";
import { normalize_upgrades_for_save } from "./upgrades";
import { debounce } from "lodash";

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
      this.setState({ site_licenses: x.query.site_licenses });
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

  public update_search(): void {
    const search = store.get("search", "").trim().toLowerCase();
    let matches_search: undefined | Set<string> = undefined;
    if (search) {
      // figure out what matches the search
      const site_licenses = store.get("site_licenses");
      if (site_licenses != null) {
        const terms = search_split(search);
        matches_search = Set<string>([]);
        const x = site_licenses.toJS();
        for (const license of x) {
          if (search_match(JSON.stringify(license).toLowerCase(), terms)) {
            matches_search = matches_search.add(license.id);
          }
        }
        if (
          matches_search != null &&
          matches_search.size == site_licenses.size
        ) {
          matches_search = undefined;
        }
      }
    }
    if (
      matches_search == null ||
      !matches_search.equals(store.get("matches_search"))
    ) {
      this.setState({ matches_search });
    }
  }

  public set_search(search: string): void {
    this.setState({ search });
    this.update_search();
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
}

export const actions = redux.createActions(
  "admin-site-licenses",
  SiteLicensesActions
);

// why 200?  https://stackoverflow.com/questions/4098678/average-inter-keypress-time-when-typing
actions.update_search = debounce(actions.update_search.bind(actions), 200);
