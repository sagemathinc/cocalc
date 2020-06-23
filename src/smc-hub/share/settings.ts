// database settings – derives configuration info for redering the html pages
import { callback2 as cb2 } from "smc-util/async-utils";
import { DNS, SITE_NAME } from "smc-util/theme";
import { PostgreSQL } from "../postgres/types";

// this is what's being passed down to the various elements and components
export interface Settings {
  readonly google_analytics: string | undefined; // e.g. UA-12345-6
  readonly dns: string; // e.g. cocalc.com
  readonly site_name: string; // e.g. CoCode
}

export class SettingsDAO {
  private database: PostgreSQL;

  constructor(database: PostgreSQL) {
    this.database = database;
  }

  async get(): Promise<Settings> {
    const server_settings = await cb2(this.database.get_server_settings_cached);
    const site_name = server_settings.site_name || SITE_NAME;
    const dns = server_settings.dns || DNS;
    // in particular, empty strings will be undefined
    const google_analytics =
      server_settings.google_analytics?.length > 0
        ? server_settings.google_analytics
        : undefined;
    return {
      site_name,
      dns,
      google_analytics,
    } as const;
  }
}
