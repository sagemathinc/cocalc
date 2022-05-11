/*
The HTTP API, which works via POST requests.
*/
import { Router } from "express";
import bodyParser from "body-parser";
const { http_message_api_v1 } = require("@cocalc/hub/api/handler");
import { callback2 } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/hub/logger";
import { database } from "../database";
import { ProjectControlFunction } from "@cocalc/server/projects/control";
import { getApiKey } from "@cocalc/server/auth/api";

export default function init(
  app_router: Router,
  projectControl: ProjectControlFunction
) {
  const logger = getLogger("api-server");
  logger.info("Initializing API server at /api/v1");

  const router = Router();

  // We need to parse POST requests.
  // Note that this can conflict with what is in
  // packages/project/servers/browser/http-server.ts
  // thus breaking file uploads to projects, so be careful!
  // That's why we make a new Router and it only applies
  // to the /api/v1 routes.  We raise the limit since the
  // default is really tiny, and there is an api call to
  // upload the contents of a file.
  router.use(bodyParser({ limit: "500kb" }));

  router.post("/*", async (req, res) => {
    let api_key;
    try {
      api_key = getApiKey(req);
    } catch (err) {
      res.status(400).send({ error: err.message });
      return;
    }
    const { body } = req;
    const path = req.baseUrl;
    const event = path.slice(path.lastIndexOf("/") + 1);
    logger.debug(`event=${event}, body=${JSON.stringify(body)}`);
    try {
      const resp = await callback2(http_message_api_v1, {
        event,
        body,
        api_key,
        logger,
        database,
        compute_server: projectControl,
        ip_address: req.ip,
      });
      res.send(resp);
    } catch (err) {
      res.status(400).send({ error: `${err}` }); // Bad Request
    }
  });

  app_router.use("/api/v1/*", router);
}
