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

const BASE: string = "/.smc/lean/";

import { lean, Lean } from "./lean";

type Router = any; // TODO

export function lean_router(express, client): Router {
  let router: Router = express.Router();
  lean_http_server(BASE, router, lean(client), client.dbg("LEAN HTTP"));
  return router;
}

function to_number(x: any): number {
  try {
    return parseInt(x);
  } catch {
    return 0;
  }
}

function lean_http_server(
  base: string,
  router: Router,
  lean: Lean,
  dbg
): Router {
  router.get(base + "*", async function(req, res) {
    dbg("req.path=", req.path);
    const x: string = decodeURIComponent(req.path.slice(base.length).trim());
    const i = x.indexOf("/");
    let command: string;
    let path: string | undefined = undefined;
    if (i == -1) {
      command = x;
    } else {
      command = x.slice(0, i);
      path = x.slice(i + 1);
    }
    dbg("command=", command);
    dbg("path=", path);
    const line: number = to_number(req.query.line);
    const column: number = to_number(req.query.column);
    dbg("line=", line, " column", column);

    switch (command) {
      case "info":
        try {
          if (path === undefined) {
            throw Error("path must be defined");
          }
          res.json(await lean.info(path, line, column));
        } catch (err) {
          res.json({ status: "error", error: err });
        }
        return;
      case "complete":
        try {
          if (path === undefined) {
            throw Error("path must be defined");
          }
          res.json(await lean.complete(path, line, column));
        } catch (err) {
          res.json({ status: "error", error: err });
        }
        return;
      case "kill":
        lean.kill();
        res.json({ status: "ok" });
        return;
      case "unregister":
        if(path === undefined) {
          res.json({ status: "error", error: "path must be defined" });
          return;
        }
        lean.unregister(path);
        res.json({ status: "ok" });
        return;
      case "register":
        if(path === undefined) {
          res.json({ status: "error", error: "path must be defined" });
          return;
        }
        lean.register(path);
        res.json({ status: "ok" });
        return;
      case "state":
        res.json({ status: "ok", state: lean.state() });
        return;
      case "messages":
        if (path === undefined) {
          throw Error("path must be defined");
        }
        res.json({ status: "ok", messages: lean.messages(path) });
        return;
      case "tasks":
        res.json({ status: "ok", tasks: lean.tasks() });
        return;
      default:
        res.json({ error: `Unknown command '${command}'` });
        return;
    }
  });
}
