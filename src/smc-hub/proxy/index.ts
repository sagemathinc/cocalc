import { Application } from "express";
import getLogger from "../logger";
import initProxy from "./handle-request";
import initUpgrade from "./handle-upgrade";
import base_path from "smc-util-node/base-path";
import { ProjectControlFunction } from "smc-hub/servers/project-control";

const winston = getLogger("proxy");

interface Options {
  app: Application;
  httpServer; // got from express_app via httpServer = http.createServer(app).
  projectControl: ProjectControlFunction; // controls projects (aka "compute server")
  isPersonal: boolean; // if true, disables all access controls
}

export default function init(opts: Options) {
  const proxy_regexp = `^${
    base_path.length <= 1 ? "" : base_path
  }\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/*`;
  winston.info(`creating proxy server with proxy_regexp="${proxy_regexp}"`);
  const handleProxy = initProxy(opts);
  const handleUpgrade = initUpgrade(opts, proxy_regexp);

  opts.app.all(proxy_regexp, handleProxy);

  opts.httpServer.on("upgrade", handleUpgrade);
}
