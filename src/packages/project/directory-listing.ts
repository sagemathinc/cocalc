/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Server directory listing through the HTTP server and Websocket API.

{files:[..., {size:?,name:?,mtime:?,isdir:?}]}

where mtime is integer SECONDS since epoch, size is in bytes, and isdir
is only there if true.

Obviously we should probably use POST instead of GET, due to the
result being a function of time... but POST is so complicated.
Use ?random= or ?time= if you're worried about cacheing.
Browser client code only uses this through the websocket anyways.
*/

import { Router } from "express";
import { join } from "node:path";

import getListing from "@cocalc/backend/get-listing";

export default function init(): Router {
  const base = "/.smc/directory_listing/";
  const router = Router();

  router.get(join(base, "{*splat}"), async (req, res) => {
    // decodeURIComponent because decodeURI(misc.encode_path('asdf/te #1/')) != 'asdf/te #1/'
    // https://github.com/sagemathinc/cocalc/issues/2400
    const path = decodeURIComponent(req.path.slice(base.length).trim());
    const { hidden } = req.query;
    // Fast -- do directly in this process.
    try {
      const files = await getListing(path, !!hidden);
      res.json({ files });
    } catch (err) {
      res.json({ error: `${err}` });
    }
  });

  return router;
}
