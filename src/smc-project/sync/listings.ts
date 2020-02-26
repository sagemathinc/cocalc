import { SyncTable } from "../smc-util/sync/table";
import { TypedMap } from "../smc-webapp/app-framework";
import { merge } from "../smc-util/misc2";
import { get_listing } from "../directory-listing";

interface Listing {
  path: string;
  project_id?: string;
  listing?: object[];
  time?: Date;
  interest?: Date;
  truncated?: boolean;
}
export type ImmutableListing = TypedMap<Listing>;

class ListingsTable {
  private table: SyncTable;
  private logger: undefined | { debug: Function };
  private project_id: string;

  constructor(table: SyncTable, logger: any, project_id: string) {
    this.project_id = project_id;
    this.logger = logger;
    this.log("register");
    this.table = table;
    this.table.on("change", this.handle_change_event.bind(this));
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug("listings_table", ...args);
  }

  private get_table(): SyncTable {
    if (this.table == null || this.table.get_state() != "connected") {
      throw Error("table not initialized ");
    }
    return this.table;
  }

  set(obj: Listing): void {
    this.get_table().set(merge({ project_id: this.project_id }, obj));
    this.get_table().save();
  }

  public get(path: string): ImmutableListing | undefined {
    return this.get_table().get(JSON.stringify([this.project_id, path]));
    // NOTE: That we have to use JSON.stringify above is an ugly shortcoming
    // of the get method in smc-util/sync/table/synctable.ts
    // that could probably be relatively easily fixed.
  }

  private handle_change_event(keys: string[]): void {
    this.log("handle_change_event", JSON.stringify(keys));
    for (const key of keys) {
      this.handle_change(JSON.parse(key)[1]);
    }
  }

  private async handle_change(path: string): Promise<void> {
    this.log("handle_change", path);
    const cur = this.get(path);
    if (cur == null) return;
    let interest: undefined | Date = cur.get("interest");
    if (interest == null) return;
    let time: undefined | Date = cur.get("time");
    if (time != null && interest <= time) {
      return;
    }
    time = new Date();
    const listing = await get_listing(path, true);
    this.log("handle_change: got listing", JSON.stringify(listing));
    if (interest > time) {
      interest = time;
    }
    this.set({ path, listing, time, interest });
  }
}

export function register_listings_table(
  table: SyncTable,
  logger: any,
  project_id: string
): void {
  logger.debug("register_listings_table");
  new ListingsTable(table, logger, project_id);
}
