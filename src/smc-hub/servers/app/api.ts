/*
The HTTP API, which works via POST requests.
*/
import { Router } from "express";
import bodyParser from "body-parser";
const { http_message_api_v1 } = require("smc-hub/api/handler");
import { split } from "smc-util/misc";
import { callback2 } from "smc-util/async-utils";
import { getLogger } from "smc-hub/logger";
import { database } from "../database";
import { ProjectControlFunction } from "smc-hub/servers/project-control";

export default function init(
  app_router: Router,
  projectControl: ProjectControlFunction
) {
  const logger = getLogger("api-server");
  logger.info("Initializing API server at /api/v1");

  const router = Router();

  // We need to parse POST requests.
  // Note that this can conflict with what is in
  // smc-project/servers/browser/http-server.ts
  // thus breaking file uploads to projects, so be careful!
  // That's why we make a new Router and it only applies
  // to the /api/v1 routes.  We raise the limit since the
  // default is really tiny, and there is an api call to
  // upload the contents of a file.
  router.use(bodyParser({ limit: "500kb" }));

  router.post("/*", async (req, res) => {
    const h = req.header("Authorization");
    if (h == null) {
      res
        .status(400)
        .send({ error: "You must provide authentication via an API key." });
      return;
    }
    const [type, user] = split(h);
    let api_key;
    switch (type) {
      case "Bearer":
        api_key = user;
        break;
      case "Basic":
        api_key = Buffer.from(user, "base64").toString().split(":")[0];
        break;
      default:
        res.status(400).send({ error: `Unknown authorization type '${type}'` });
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
