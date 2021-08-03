import { database } from "./database";
import { getClients } from "../clients";
import getServerSettings from "./server-settings";

export default async function init() {
  if (database.is_standby) {
    return;
  }
  const clients = getClients();
  const settings = await getServerSettings();
  let version_recommended_browser: number = 0; // first time.
  const update = () => {
    if (
      settings.version["version_recommended_browser"] ==
      version_recommended_browser
    ) {
      // version did not change
      return;
    }
    version_recommended_browser =
      settings.version["version_recommended_browser"];
    for (const id in clients) {
      const client = clients[id];
      if (client.smc_version < version_recommended_browser) {
        client.push_version_update();
      }
    }
  };
  update();
  settings.table.on("change", update);
}
