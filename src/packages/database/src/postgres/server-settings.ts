import { PostgreSQL } from "./types";
import { AllSiteSettings } from "@cocalc/util/db-schema/types";
import { callback2 } from "@cocalc/util/async-utils";

// just to make this async friendly, that's all
export async function get_server_settings(
  db: PostgreSQL
): Promise<AllSiteSettings> {
  return await callback2(db.get_server_settings_cached);
}
