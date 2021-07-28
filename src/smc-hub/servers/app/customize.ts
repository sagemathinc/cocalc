import { WebappConfiguration } from "smc-hub/webapp-configuration";
import { database } from "../database";
import { send as sendManifest } from "smc-hub/manifest";

export default function init(router, isPersonal: boolean) {
  const webappConfig = new WebappConfiguration({ db: database });

  router.get("/customize", async (req, res) => {
    // If we're behind cloudflare, we expose the detected country in the client.
    // Use a lib like https://github.com/michaelwittig/node-i18n-iso-countries
    // to read the ISO 3166-1 Alpha 2 codes.
    // If it is unknown, the code will be XX and K1 is the Tor-Network.
    const country = req.headers["cf-ipcountry"] ?? "XX";
    const host = req.headers["host"];
    const config = await webappConfig.get({ host, country });
    if (isPersonal) {
      config.configuration.is_personal = true;
    }
    if (req.query.type === "manifest") {
      // Used for progressive webapp info.
      sendManifest(res, config);
    } else {
      // Otherwise, just send the data back as json, for the client to parse.
      res.json(config);
    }
  });
}
