import { Application, static } from "express";
import * as index from "serve-index";

export default function init(app: Application, base: string) {

  // Setup the static raw HTTP server.  This must happen after anything above,
  // since it serves all URL's (so it has to be the fallback).
  app.use(base, (req, res, next) => {
    // this middleware function has to come before the express.static server!
    // it sets the content type to octet-stream (aka "download me") if URL query ?download exists
    if (req.query.download != null) {
      res.setHeader("Content-Type", "application/octet-stream");
    }
    // Note: we do not set no-cache since that causes major issues on Safari:
    //   https://github.com/sagemathinc/cocalc/issues/5120
    // By now our applications should use query params to break the cache.
    res.setHeader("Cache-Control", "private, must-revalidate");
    next();
  });

  app.use(base, index(home, { hidden: true, icons: true }));

  app.use(base, static(home, { hidden: true }));
}
