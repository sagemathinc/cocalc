import { reuseInFlight } from "async-await-utils/hof";
import { SyncTable } from "smc-util/sync/table";
import { webapp_client } from "../../webapp-client";
import { TypedMap } from "../../app-framework";
import { merge } from "smc-util/misc2";

interface Listing {
  path: string;
  project_id?: string;
  listing?: object[];
  time?: Date;
  interest?: Date;
  missing?: number;
}
export type ImmutableListing = TypedMap<Listing>;

export class Listings {
  private table?: SyncTable;
  private project_id: string;

  constructor(project_id: string): void {
    this.project_id = project_id;
  }

  public async init(): Promise<void> {
    this.table = await webapp_client.synctable_project(
      this.project_id,
      {
        listings: [
          {
            project_id: this.project_id,
            path: null,
            listing: null,
            time: null,
            interest: null,
            missing: null
          }
        ]
      },
      []
    );
  }

  private get_table(): SyncTable {
    if (this.table == null || this.table.get_state() != "connected") {
      throw Error("table not initialized ");
    }
    return this.table;
  }

  private set(obj: Listing): void {
    this.get_table().set(merge({ project_id: this.project_id }, obj));
    this.get_table().save();
  }

  public get(path: string): ImmutableListing | undefined {
    return this.get_table().get(JSON.stringify([this.project_id, path]));
    // NOTE: That we have to use JSON.stringify above is an ugly shortcoming
    // of the get method in smc-util/sync/table/synctable.ts
    // that could probably be relatively easily fixed.
  }

  public set_interest(path: string): void {
    this.set({
      path,
      interest: webapp_client.server_time()
    });
  }
}

export const listings = reuseInFlight(async function(
  project_id: string
): Promise<Listings> {
  const x = new Listings(project_id);
  await x.init();
  return x;
});
