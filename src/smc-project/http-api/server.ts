/*
Express HTTP API server

This is meant to be used from within the project via localhost, both
to get info from the project, and to cause the project to do things.

Requests must be authenticated using the secret token.
*/

const MAX_REQUESTS_PER_MINUTE = 50;

import * as express from "express";
import { writeFile } from "fs";
import { callback } from "awaiting";
import { split } from "../smc-util/misc2";
import { json, urlencoded } from "body-parser";

const { free_port } = require("../../smc-util-node/misc_node");
const { client_db } = require("../smc-util/db-schema");
const RateLimit = require("express-rate-limit");

export interface Client {
  project_id: string;
  secret_token: string;
  get_syncdoc_history: (string_id: string) => Promise<any>;
  dbg: (name: string) => Function;
}

interface ServerOpts {
  client: Client;
  port?: number;
  port_path?: string;
}

export async function start_server(opts: ServerOpts): Promise<void> {
  const dbg: Function = opts.client.dbg("api_server");

  const server: express.Application = express();

  server.use(json({ limit: "3mb" }));
  server.use(urlencoded({ extended: true, limit: "3mb" }));

  rate_limit(server);

  server.get("/", handle_get);

  server.post("/api/v1/*", async (req, res) => {
    try {
      dbg(`POST to ${req.path}`);
      handle_auth(req, opts.client.secret_token);
      await handle_post(req, res, opts.client);
    } catch (err) {
      dbg(`failed handling POST ${err}`);
      res.status(400).send({ error: `${err}` });
    }
  });

  if (opts.port == null) {
    opts.port = await callback(free_port);
  }

  if (opts.port_path) {
    await callback(writeFile, opts.port_path, opts.port);
  }

  server.listen(opts.port, () => {
    dbg(`server listening at http://localhost:${opts.port}`);
  });
}

function rate_limit(server: express.Application): void {
  // (suggested by LGTM):
  // set up rate limiter -- maximum of 50 requests per minute
  const limiter = new RateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: MAX_REQUESTS_PER_MINUTE
  });
  // apply rate limiter to all requests
  server.use(limiter);
}

function handle_get(_req, res): void {
  // Don't do anything useful, since user is not authenticated!
  res.send({ status: "ok", mesg: "use a POST requesty" });
}

function handle_auth(req, secret_token: string): void {
  const h = req.header("Authorization");
  if (h == null) {
    throw Error("you MUST authenticate all requests via secret_token");
  }

  let provided_token: string;
  const [type, user] = split(h);
  switch (type) {
    case "Bearer":
      provided_token = user;
      break;
    case "Basic":
      const x = Buffer.from(user, "base64");
      provided_token = x.toString().split(":")[0];
      break;
    default:
      throw Error(`unknown authorization type '${type}'`);
  }
  // now check auth
  if (secret_token != provided_token) {
    throw Error("incorrect secret_token");
  }
}

async function handle_post(req, res, client: Client): Promise<void> {
  const endpoint: string = req.path.slice(req.path.lastIndexOf("/") + 1);
  try {
    switch (endpoint) {
      case "get_syncdoc_history":
        res.send(await get_syncdoc_history(req.body, client));
        return;
      default:
        throw Error("unknown endpoint");
    }
  } catch (err) {
    throw Error(`handling api endpoint ${endpoint} -- ${err}`);
  }
}

async function get_syncdoc_history(body, client: Client): Promise<any> {
  const dbg = client.dbg("get_syncdoc_history");
  const path = body.path;
  dbg(`path="${path}"`);
  if (typeof path != "string") {
    throw Error("provide the path as a string");
  }
  // compute the string_id
  const string_id = client_db.sha1(client.project_id, path);
  return await client.get_syncdoc_history(string_id);
}
