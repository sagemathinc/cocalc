/*

init_smc_version = (db, cb) ->
    if db.is_standby
        cb()
        return
    server_settings = require('./server-settings')(db)
    if server_settings.table._state == 'init'
        server_settings.table.once('init', => cb())
    else
        cb()
    # winston.debug("init smc_version: #{misc.to_json(smc_version.version)}")
    server_settings.table.on 'change', ->
        winston.info("version changed -- sending updates to clients")
        for id, c of clients
            if c.smc_version < server_settings.version.version_recommended_browser
                c.push_version_update()

*/

import { database } from "./database";
const { get_clients } = require("../clients");
import getServerSettings from "./server-settings";

export default function init() {
  if (database.is_standby) {
    return;
  }
  const clients = get_clients();
  const settings = getServerSettings();
  let version_recommended_browser: number = 0; // first time.
  settings.table.on("change", () => {
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
  });
}
