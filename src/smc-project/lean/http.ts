/* 
HTTP access to the LEAN server.

Below path is the path to a .lean file, relative to the home 
directory of the CoCalc project.

/info/path='...'?line=x[&column=y]       -- get info about particular point
/complete/path='...'?line=x[&column=y]   -- get completions at a point
/kill                                    -- kill the lean server
/unregister/path                         -- stop watching given file for changes
/register/path                           -- start watching given file for changes
/state/path                              -- JSON blob with current parse info about the path;
                                            this hould normally be got via a synctable, NOT
                                            http, but is also here for debugging purposes

Calling info or complete will automatically start the lean
server and start parsing the given path if necessary, and
wait until that is done before returning (hence can easily
timeout -- client should retry).
*/

const BASE: string = "/.smc/lean";

import { lean, Lean } from "./lean";

type Router = any; // TODO

export function lean_router(express, client): Router {
  let router: Router = express.Router();
  lean_http_server(BASE, router, lean(client));
  return router;
}

function lean_http_server(base: string, router: Router, lean: Lean): Router {
  router.get(base + "*", function(req, res) {
    const x: string = decodeURIComponent(req.path.slice(base.length).trim());
    const v = x.split("/");
    const command = v[0];
    const path = v[1];
    const line: number | undefined = req.query.line;
    const column: number | undefined = req.query.column;

    switch (command) {
      case "info":
        res.json(await lean.info(path, line, column));
        return;
      case "complete":
        res.json(await lean.complete(path, line, column));
        return;
      case "kill":
        lean.kill();
        res.json({'status':'ok'});
        return;
      case "unregister":
        lean.unregister(path);
        res.json({'status':'ok'});
        return;
      case "register":
        lean.register(path);
        res.json({'status':'ok'});
        return;
      case "state":
        res.json(lean.state());
        return;
      default:
        res.json({ error: `Unknown command '${command}'` });
        return;
    }
  });
}
