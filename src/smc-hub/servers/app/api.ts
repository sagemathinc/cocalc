/*
The HTTP API, which works via POST requests.
*/
import { Router } from "express";
const { http_message_api_v1 } = require("smc-hub/api/handler");
import { split } from "smc-util/misc";
import { callback2 } from "smc-util/async-utils";
import { getLogger } from "smc-hub/logger";
import { database } from "../database";
import { ProjectControlFunction } from "smc-hub/servers/project-control";

export default function init(
  router: Router,
  projectControl: ProjectControlFunction
) {
  const logger = getLogger("api-server");
  router.post("/api/v1/*", async (req, res) => {
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

    try {
      const resp = await callback2(http_message_api_v1, {
        event: req.path.slice(req.path.lastIndexOf("/") + 1),
        body: req.body,
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
}
