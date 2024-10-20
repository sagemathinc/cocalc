/*
Serve static files from the home directory.  

NOTE: There is a very similar server in /src/packages/project/servers/browser/static.ts
See comments there.
*/

import { static as staticServer } from "express";
import index from "serve-index";
import { getLogger } from "../logger";
import { Router } from "express";

const log = getLogger("http-server:static");

export default function initStatic({ home }: { home: string }): Router {
  const router = Router();
  router.use("/", (req, res, next) => {
    if (req.query.download != null) {
      res.setHeader("Content-Type", "application/octet-stream");
    }
    res.setHeader("Cache-Control", "private, must-revalidate");
    next();
  });

  log.info(`serving up HOME="${home}"`);

  router.use("/", index(home, { hidden: true, icons: true }));
  router.use("/", staticServer(home, { dotfiles: "allow" }));
  return router;
}
