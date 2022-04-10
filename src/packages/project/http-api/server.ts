/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Express HTTP API server.

This is meant to be used from within the project via localhost, both
to get info from the project, and to cause the project to do things.

Requests must be authenticated using the secret token.
*/

const MAX_REQUESTS_PER_MINUTE = 150;

import express from "express";
import { writeFile } from "fs";
import { callback } from "awaiting";
import { once } from "@cocalc/util/async-utils";
import { split } from "@cocalc/util/misc";
import { json, urlencoded } from "body-parser";
import type { Request } from "express";
import RateLimit from "express-rate-limit";
import { apiServerPortFile } from "@cocalc/project/data";
const theClient = require("@cocalc/project/client");
import { secretToken } from "@cocalc/project/servers/secret-token";

let client: any = undefined;
export { client };

import getSyncdocHistory from "./get-syncdoc-history";
import writeTextFile from "./write-text-file";
import readTextFile from "./read-text-file";

export default async function init(): Promise<void> {
  client = theClient.client;
  if (client == null) throw Error("client must be defined");
  const dbg: Function = client.dbg("api_server");
  const app: express.Application = express();

  dbg("configuring server...");
  configure(app, dbg);

  const server = app.listen(0, "localhost");
  await once(server, "listening");
  const address = server.address();
  if (address == null || typeof address == "string") {
    throw Error("failed to assign a port");
  }
  const { port } = address;
  dbg(`writing port to file "${apiServerPortFile}"`);
  await callback(writeFile, apiServerPortFile, `${port}`);

  dbg(`express server successfully listening at http://localhost:${port}`);
}

function configure(server: express.Application, dbg: Function): void {
  server.use(json({ limit: "3mb" }));
  server.use(urlencoded({ extended: true, limit: "3mb" }));

  rateLimit(server);

  const handler = async (req, res) => {
    dbg(`handling ${req.path}`);
    try {
      handleAuth(req);
      res.send(await handleEndpoint(req));
    } catch (err) {
      dbg(`failed handling ${req.path} -- ${err}`);
      res.status(400).send({ error: `${err}` });
    }
  };

  server.get("/api/v1/*", handler);
  server.post("/api/v1/*", handler);
}

function rateLimit(server: express.Application): void {
  // (suggested by LGTM):
  // set up rate limiter -- maximum of MAX_REQUESTS_PER_MINUTE requests per minute
  const limiter = RateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: MAX_REQUESTS_PER_MINUTE,
  });
  // apply rate limiter to all requests
  server.use(limiter);
}

function handleAuth(req): void {
  const h = req.header("Authorization");
  if (h == null) {
    throw Error("you MUST authenticate all requests");
  }

  let providedToken: string;
  const [type, user] = split(h);
  switch (type) {
    case "Bearer":
      providedToken = user;
      break;
    case "Basic":
      const x = Buffer.from(user, "base64");
      providedToken = x.toString().split(":")[0];
      break;
    default:
      throw Error(`unknown authorization type '${type}'`);
  }
  // now check auth
  if (secretToken != providedToken) {
    throw Error(`incorrect secret token "${secretToken}", "${providedToken}"`);
  }
}

async function handleEndpoint(req): Promise<any> {
  const endpoint: string = req.path.slice(req.path.lastIndexOf("/") + 1);
  switch (endpoint) {
    case "get-syncdoc-history":
      return await getSyncdocHistory(getParams(req, ["path", "patches"]));
    case "write-text-file":
      return await writeTextFile(getParams(req, ["path", "content"]));
    case "read-text-file":
      return await readTextFile(getParams(req, ["path"]));
    default:
      throw Error(`unknown endpoint - "${endpoint}"`);
  }
}

function getParams(req: Request, params: string[]) {
  const x: any = {};
  if (req?.method == "POST") {
    for (const param of params) {
      x[param] = req.body?.[param];
    }
  } else {
    for (const param of params) {
      x[param] = req.query?.[param];
    }
  }
  return x;
}
