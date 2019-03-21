/*
Express HTTP API server

This is meant to be used from within the project via localhost, both
to get info from the project, and to cause the project to do things.

Requests must be authenticated using the secret token ~/.smc/secret_token
*/

import * as express from "express";
import { writeFile } from "fs";
import { callback } from "awaiting";

const { free_port } = require("../../smc-util-node/misc_node");

interface ServerOpts {
  port?: number;
  port_path?: string;
}

export async function start_server(opts: ServerOpts = {}): Promise<void> {
  const server: express.Application = express();

  server.get("/", (_req, res) => {
    res.send("Hello world!");
  });

  if (opts.port == null) {
    opts.port = await callback(free_port);
  }

  if (opts.port_path) {
    await callback(writeFile, opts.port_path, opts.port);
  }

  server.listen(opts.port, () => {
    console.log(`server started at http://localhost:${opts.port}`);
  });
}
