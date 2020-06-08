/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is the HTTP Proxy Server, which passes requests directly onto various
servers running in projects.

Development note:

*/

/*
Rewrite of proxy.coffee todo list:

- [x] get it to compile
- [x] get it to work
- [ ] get rid of callbacks
- [ ] add full typing
- [ ] refactor code into multiple files
*/

import * as Cookies from "cookies"; // https://github.com/jed/cookies
import { series } from "async";
const winston = require("../winston-metrics").get_logger("proxy");
import * as ms from "ms";
import { createProxyServer } from "http-proxy";
import { parse as parse_url } from "url";
import { createServer } from "http";
import { getType } from "mime";
import {
  is_valid_uuid_string,
  len,
  path_is_in_public_paths,
  walltime,
  defaults,
  required,
} from "smc-util/misc";
import { DOMAIN_NAME } from "smc-util/theme";
import { VERSION_COOKIE_NAME } from "smc-util/consts";
import { generate_hash, remember_me_cookie_name } from "../auth";
import { callback2, once } from "smc-util/async-utils";
import { get_server_settings } from "../server-settings";
const hub_projects = require("../projects");
const access = require("../access");

import { Database, ComputeServer } from "./types";

const DEBUG2 = false;

let server_settings;

export async function init_smc_version(db): Promise<void> {
  winston.debug("init_smc_version: ");
  if (db.is_standby) {
    return;
  }
  server_settings = get_server_settings(db);
  if (server_settings.table._state === "init") {
    winston.debug("init_smc_version: Waiting for init to finish");
    await once(server_settings.table, "init");
  }
  winston.debug("init_smc_version: Table now ready!", server_settings.version);
}

export function version_check(req, res, base_url) {
  const c = new Cookies(req);
  // The arbitrary name of the cookie $VERSION_COOKIE_NAME ('cocalc_version') is
  // also used in the frontend code file
  //     smc-webapp/set-version-cookie.js
  // pre Nov'19: The encodeURIComponent below is because js-cookie does
  //             the same in order to *properly* deal with / characters.
  // post Nov'19: switching to universal-cookie in the client, because it supports
  //              SameSite=none. Now, the client explicitly encodes the base_url.
  //              The cookie name is set in smc-util/misc2
  let raw_val = c.get(encodeURIComponent(base_url) + VERSION_COOKIE_NAME);
  if (raw_val == null) {
    // try legacy cookie fallback
    raw_val = c.get(
      encodeURIComponent(base_url) + VERSION_COOKIE_NAME + "-legacy"
    );
  }
  const version = parseInt(raw_val);
  const min_version = server_settings.version.version_min_browser;
  winston.debug("client version_check", version, min_version);
  if (isNaN(version) || version < min_version) {
    if (res != null) {
      // status code 4xx to indicate this is a client problem and not 5xx, a server problem
      // 426 means "upgrade required"
      res.writeHead(426, { "Content-Type": "text/html" });
      res.end(
        `426 (UPGRADE REQUIRED): reload CoCalc tab or restart your browser -- version=${version} < required_version=${min_version}`
      );
    }
    return true;
  } else {
    return false;
  }
}

// In the interest of security and "XSS", we strip the "remember_me" cookie from the header before
// passing anything along via the proxy.
// Nov'19: actually two cookies due to same-site changes. See https://web.dev/samesite-cookie-recipes/#handling-incompatible-clients
//         also, there was no base_url support. no clue why...
export function strip_remember_me_cookie(cookie, base_url: string) {
  if (cookie == null) {
    return { cookie, remember_me: undefined };
  } else {
    const v: string[] = [];
    let remember_me = undefined;
    for (const c of cookie.split(";")) {
      const z = c.split("=");
      if (z[0].trim() === remember_me_cookie_name(base_url, false)) {
        remember_me = z[1].trim();
        // fallback, "true" for legacy variant
      } else if (
        remember_me == null &&
        z[0].trim() === remember_me_cookie_name(base_url, true)
      ) {
        remember_me = z[1].trim();
      } else {
        v.push(c);
      }
    }
    return { cookie: v.join(";"), remember_me };
  }
}

export function target_parse_req(
  remember_me: string | undefined,
  url: string
): {
  key: string;
  type: "port" | "raw" | "server";
  project_id: string;
  port_number: string;
  internal_url?: string;
} {
  let port;
  const v = url.split("/");
  const project_id = v[1];
  const type = v[2]; // 'port' or 'raw' or 'server'
  if (type != "port" && type != "raw" && type != "server") {
    const err = `type=("${type}") must be one of port, raw, or server -- url="${url}"`;
    winston.debug(err);
    throw Error(err);
  }
  let key = remember_me + project_id + type;
  // if defined, this is the UTL called
  let internal_url: string | undefined = undefined;
  if (type === "port") {
    key += v[3];
    port = v[3];
  } else if (type === "server") {
    key += v[3];
    port = v[3];
    internal_url = v.slice(4).join("/");
  }
  return { key, type, project_id, port_number: port, internal_url };
}

export async function jupyter_server_port(opts: {
  project_id: string; // assumed valid and that all auth already done
  compute_server: ComputeServer;
  database: Database;
}): Promise<number> {
  const project = hub_projects.new_project(opts);
  return await callback2(project.jupyter_port, {});
}

export async function init_http_proxy_server(opts: {
  database: Database;
  compute_server: ComputeServer;
  base_url: string;
  port: number;
  host: string;
}) {
  opts = defaults(opts, {
    database: required,
    compute_server: required,
    base_url: required,
    port: required,
    host: required,
  });
  const { database, compute_server, base_url } = opts;

  winston.debug("init_http_proxy_server");

  winston.debug("init_http_proxy_server -- init_smc_version: start...");
  await init_smc_version(opts.database);
  winston.debug("init_http_proxy_server -- init_smc_version: done");

  // Checks for access to project, and in case of write access,
  // also touch's project thus recording that user is interested
  // in this project (which sets the last_active time).
  function _remember_me_check_for_access_to_project(opts) {
    opts = defaults(opts, {
      project_id: required,
      remember_me: required,
      type: "write", // 'read' or 'write'
      cb: required,
    }); // cb(err, has_access)
    const dbg = (m) => {
      winston.debug(`remember_me_check_for_access_to_project: ${m}`);
    };
    let account_id: string | undefined = undefined;
    let email_address: string | undefined = undefined;
    let has_access = false;
    let hash: string | undefined = undefined;
    series(
      [
        function (cb) {
          dbg("get remember_me message");
          const x = opts.remember_me.split("$");
          try {
            hash = generate_hash(x[0], x[1], x[2], x[3]);
          } catch (error) {
            const err = error;
            const msg = `unable to generate hash from remember_me cookie = '${opts.remember_me}' -- ${err}`;
            dbg(msg);
            cb(msg);
            return;
          }
          database.get_remember_me({
            hash,
            cache: true,
            cb: (err, signed_in_mesg) => {
              if (err || signed_in_mesg == null) {
                cb(`unable to get remember_me from db -- ${err}`);
                dbg(`failed to get remember_me -- ${err}`);
              } else {
                ({ account_id } = signed_in_mesg);
                ({ email_address } = signed_in_mesg);
                dbg(`account_id=${account_id}, email_address=${email_address}`);
                cb();
              }
            },
          });
        },
        function (cb) {
          dbg(`check if user has ${opts.type} access to project`);
          if (opts.type === "write") {
            access.user_has_write_access_to_project({
              database,
              project_id: opts.project_id,
              account_id,
              cb: (err, result) => {
                dbg(`got: ${err}, ${result}`);
                if (err) {
                  cb(err);
                } else if (!result) {
                  cb("User does not have write access to project.");
                } else {
                  has_access = true;
                  // Record that user is going to actively access
                  // this project.  This is important since it resets
                  // the idle timeout.
                  database.touch({
                    account_id,
                    project_id: opts.project_id,
                    cb,
                  });
                }
              },
            });
          } else {
            access.user_has_read_access_to_project({
              project_id: opts.project_id,
              account_id,
              database,
              cb: (err, result) => {
                dbg(`got: ${err}, ${result}`);
                if (err) {
                  cb(err);
                } else if (!result) {
                  cb("User does not have read access to project.");
                } else {
                  has_access = true;
                  cb();
                }
              },
            });
          }
        },
      ],
      (err) => opts.cb(err, has_access)
    );
  }

  let _remember_me_cache = {};
  function remember_me_check_for_access_to_project(opts) {
    opts = defaults(opts, {
      project_id: required,
      remember_me: required,
      type: "write",
      cb: required,
    }); // cb(err, has_access)
    const key = opts.project_id + opts.remember_me + opts.type;
    const has_access = _remember_me_cache[key];
    if (has_access != null) {
      opts.cb(false, has_access);
      return;
    }
    // get the answer, cache it, return answer
    _remember_me_check_for_access_to_project({
      project_id: opts.project_id,
      remember_me: opts.remember_me,
      type: opts.type,
      cb(err, has_access) {
        // if cache gets huge for some *weird* reason (should never happen under normal conditions),
        // just reset it to avoid any possibility of DOS-->RAM crash attack
        if (len(_remember_me_cache) >= 100000) {
          _remember_me_cache = {};
        }

        _remember_me_cache[key] = has_access;
        // Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
        // but also if the user is suddenly granted permission to the project, this should be
        // reflected within a few seconds.
        const f = () => delete _remember_me_cache[key];
        if (has_access) {
          setTimeout(f, 1000 * 60 * 7);
          // access lasts 7 minutes (i.e., if you revoke privs to a user they
          // could still hit the port for this long)
        } else {
          setTimeout(f, 1000 * 10);
        }
        // not having access lasts 10 seconds -- maybe they weren't logged in yet..., so don't
        // have things broken forever!
        opts.cb(err, has_access);
      },
    });
  }

  const target_cache = {};

  function invalidate_target_cache(
    remember_me: string | undefined,
    url: string
  ): void {
    let x;
    try {
      x = target_parse_req(remember_me, url);
    } catch (err) {
      winston.debug(`invalidate_target_cache err: ${err}`);
      // in case of invalid remember_me or url -- nothing
      return;
    }
    const { key } = x;
    winston.debug(`invalidate_target_cache: ${url}`);
    delete target_cache[key];
  }

  function target(remember_me, url, cb) {
    let x;
    try {
      x = target_parse_req(remember_me, url);
    } catch (err) {
      cb(err);
      return;
    }
    const { key, type, project_id, port_number, internal_url } = x;

    let t = target_cache[key];
    if (t != null) {
      cb(false, t, internal_url);
      return;
    }

    const dbg = (m) => winston.debug(`target(${key}): ${m}`);
    dbg(`url=${url}`);

    const tm = walltime();
    let host: string | undefined = undefined;
    let port: number | string | undefined = undefined;
    let project: {
      host: string;
      _kubernetes?: boolean;
      status: ({ cb: Function }) => void;
    };
    series(
      [
        function (cb) {
          if (remember_me == null) {
            // remember_me = undefined means "allow"; this is used for the websocket upgrade.
            cb();
            return;
          }

          // It's still unclear if we will ever grant read access to the raw server...
          //if type == 'raw'
          //    access_type = 'read'
          //else
          //    access_type = 'write'
          const access_type = "write";

          remember_me_check_for_access_to_project({
            project_id,
            remember_me,
            type: access_type,
            cb(err, has_access) {
              dbg(
                `finished remember_me_check_for_access_to_project (mark: ${walltime(
                  tm
                )}) -- ${err ? err : ""}`
              );
              if (err) {
                cb(err);
              } else if (!has_access) {
                cb(`user does not have ${access_type} access to this project`);
              } else {
                cb();
              }
            },
          });
        },
        (cb) =>
          compute_server.project({
            project_id,
            cb(err, _project) {
              dbg(
                `first compute_server.project finished (mark: ${walltime(
                  tm
                )}) -- ${err}`
              );
              if (err) {
                cb(err);
              } else {
                project = _project;
                ({ host } = project);
                cb();
              }
            },
          }),
        function (cb) {
          if (!project._kubernetes) {
            // this is ugly -- i need to change host in case of kubernetes.
            cb();
            return;
          }
          project.status({
            cb(err, status) {
              if (err) {
                cb(err);
              } else {
                if (!status.ip) {
                  cb("must wait for project to start");
                } else {
                  host = status.ip; // actual ip of the pod
                  cb();
                }
              }
            },
          });
        },
        async function (cb) {
          //dbg("determine the port")
          if (type === "port" || type === "server") {
            if (port_number === "jupyter") {
              dbg("determine jupyter_server_port");
              try {
                port = await jupyter_server_port({
                  project_id,
                  compute_server,
                  database,
                });
              } catch (err) {
                cb(err);
                return;
              }
              dbg(`got jupyter_port=${port}`);
              cb();
            } else {
              port = port_number;
              cb();
            }
          } else if (type === "raw") {
            compute_server.project({
              project_id,
              cb(err, project) {
                dbg(
                  `second compute_server.project finished (mark: ${walltime(
                    tm
                  )}) -- ${err}`
                );
                if (err) {
                  cb(err);
                } else {
                  project.status({
                    cb(err, status) {
                      dbg(`project.status finished (mark: ${walltime(tm)})`);
                      if (err) {
                        cb(err);
                      } else if (!status["raw.port"]) {
                        cb(
                          "raw port not available -- project might not be opened or running"
                        );
                      } else {
                        port = status["raw.port"];
                        cb();
                      }
                    },
                  });
                }
              },
            });
          } else {
            cb(`unknown url type -- ${type}`);
          }
        },
      ],
      function (err) {
        dbg(
          `all finished (mark: ${walltime(
            tm
          )}): host=${host}; port=${port}; type=${type} -- ${err}`
        );
        if (err) {
          cb(err);
        } else {
          t = { host, port };
          target_cache[key] = t;
          cb(false, t, internal_url);
          /*
          Set a ttl time bomb on this cache entry. The idea is to
          keep the cache not too big, but also if a new user is granted
          permission to the project they didn't have, or the project server
          is restarted, this should be reflected.  Since there are
          dozens (at least) of hubs, and any could cause a project
          restart at any time, we just timeout this.
          This helps enormously when there is a burst of requests.
          Also if project restarts the raw port will change and we
          don't want to have fix this via getting an error.

          Also, if the project stops and starts, the host=ip address
          could change, so we need to timeout so we see that...
          */
          setTimeout(() => delete target_cache[key], 30 * 1000);
        }
      }
    );
  }

  const proxy_cache = {};

  function remove_from_cache(
    t: string,
    remember_me: string | undefined,
    req_url: string,
    proxy
  ): void {
    delete proxy_cache[t];
    invalidate_target_cache(remember_me, req_url);
    proxy.close();
  }

  const http_proxy_server = createServer(function (req, res) {
    if (typeof req.url != "string") {
      throw Error("req url must be a string");
    }
    const tm = walltime();
    const { query } = parse_url(req.url, true);
    // strip base_url for purposes of determining project location/permissions
    const req_url = req.url.slice(base_url.length);
    if (req_url === "/alive") {
      res.end("");
      return;
    }

    function dbg(m) {
      //# for low level debugging
      if (DEBUG2) {
        winston.debug(`http_proxy_server(${req_url}): ${m}`);
      }
    }
    dbg("got request");

    if (exports.version_check(req, res, base_url)) {
      dbg("version check failed");
      return;
    }

    /* Before doing anything further with the request on to the
       proxy, we remove **all** cookies whose name contains "remember_me",
       to prevent the project backend from getting at the user's session
       cookie, since one project shouldn't be able to get access to any
       user's account.
    */
    winston.debug("cookies", req.headers["cookie"]);
    const x = strip_remember_me_cookie(req.headers["cookie"], base_url);
    const { remember_me } = x;
    req.headers["cookie"] = x.cookie;

    if (remember_me == null) {
      // before giving an error, check on possibility that file is public
      public_raw(req_url, query, res, function (err, is_public) {
        if (err || !is_public) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(
            `Please login to <a target='_blank' href='${DOMAIN_NAME}'>${DOMAIN_NAME}</a> with cookies enabled, then refresh this page.`
          );
        }
      });

      return;
    }

    target(remember_me, req_url, function (err, location, internal_url) {
      dbg(`got target: ${walltime(tm)}`);
      if (err) {
        public_raw(req_url, query, res, function (err, is_public) {
          if (err || !is_public) {
            winston.debug(`proxy denied -- ${err}`);
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(
              `Access denied. Please login to <a target='_blank' href='${DOMAIN_NAME}'>${DOMAIN_NAME}</a> as a user with access to this project, then refresh this page.`
            );
          }
        });
      } else {
        let proxy;
        const t = `http://${location.host}:${location.port}`;
        if (proxy_cache[t] != null) {
          // we already have the proxy server for this remote location in the cache, so use it.
          proxy = proxy_cache[t];
          dbg(`using cached proxy object: ${walltime(tm)}`);
        } else {
          dbg("make a new proxy server connecting to this remote location");
          proxy = createProxyServer({
            ws: false,
            target: t,
            timeout: 7000,
          });
          // and cache it.
          proxy_cache[t] = proxy;
          dbg(`created new proxy: ${walltime(tm)}`);
          // setup error handler, so that if something goes wrong with this proxy (it will,
          // e.g., on project restart), we properly invalidate it.
          proxy.on("error", function (e) {
            dbg(`http proxy error event -- ${e}`);
            remove_from_cache(t, remember_me, req_url, proxy);
          });

          proxy.on("close", () =>
            // only happens with websockets, but...
            remove_from_cache(t, remember_me, req_url, proxy)
          );

          // Always clear after 5 minutes.  This is fine since the proxy is just used
          // to handle individual http requests, and the cache is entirely for speed.
          // Also, it avoids weird cases, where maybe error/close don't get
          // properly called, but the proxy is not working due to network issues.
          setTimeout(remove_from_cache, 5 * 60 * 1000);
        }

        if (internal_url != null) {
          req.url = internal_url;
        }
        proxy.web(req, res);
      }
    });
  });

  winston.debug(`starting proxy server listening on ${opts.host}:${opts.port}`);
  http_proxy_server.listen(opts.port, opts.host);

  // add websockets support
  const _ws_proxy_servers = {};
  http_proxy_server.on("upgrade", function (req, socket, head) {
    // Strip remember_me cookie from req used for websocket upgrade.
    req.headers["cookie"] = strip_remember_me_cookie(
      req.headers["cookie"],
      base_url
    ).cookie;

    const req_url = req.url.slice(base_url.length); // strip base_url for purposes of determining project location/permissions
    const dbg = (m) => {
      winston.debug(`http_proxy_server websocket(${req_url}): ${m}`);
    };

    if (exports.version_check(req, undefined, base_url)) {
      dbg("websocket upgrade -- version check failed");
      return;
    }

    target(undefined, req_url, function (err, location, internal_url) {
      if (err) {
        dbg(`websocket upgrade error -- ${err}`);
      } else {
        dbg(
          `websocket upgrade success -- ws://${location.host}:${location.port}`
        );
        const t = `ws://${location.host}:${location.port}`;
        let proxy = _ws_proxy_servers[t];
        if (proxy == null) {
          dbg(`websocket upgrade ${t} -- not using cache`);
          proxy = createProxyServer({
            ws: true,
            target: t,
            timeout: 0,
          });
          proxy.on("error", function (e) {
            dbg(`websocket proxy error, so clearing cache -- ${e}`);
            delete _ws_proxy_servers[t];
            invalidate_target_cache(undefined, req_url);
          });
          _ws_proxy_servers[t] = proxy;
        } else {
          dbg("websocket upgrade -- using cache");
        }
        if (internal_url != null) {
          req.url = internal_url;
        }
        proxy.ws(req, socket, head);
      }
    });
  });

  const public_raw_paths_cache = {};

  function public_raw(req_url, query, res, cb) {
    // Determine if the requested path is public (and not too big).
    // If so, send content to the client and cb(undefined, true)
    // If not, cb(undefined, false)
    // req_url = /9627b34f-fefd-44d3-88ba-5b1fc1affef1/raw/a.html
    const x = req_url.split("?");
    const v = x[0].split("/");
    if (v[2] !== "raw") {
      cb(undefined, false);
      return;
    }
    const project_id = v[1];
    if (!is_valid_uuid_string(project_id)) {
      cb(undefined, false);
      return;
    }
    const path = decodeURI(v.slice(3).join("/"));
    winston.debug(`public_raw: project_id=${project_id}, path=${path}`);
    let public_paths = undefined;
    let is_public = false;
    series(
      [
        function (cb) {
          // Get a list of public paths in the project, or use the cached list
          // The cached list is cached for a few seconds, since a typical access
          // pattern is that the client downloads a bunch of files from the same
          // project in parallel.  On the other hand, we don't want to cache for
          // too long, since the project user may add/remove public paths at any time.
          public_paths = public_raw_paths_cache[project_id];
          if (public_paths != null) {
            cb();
          } else {
            database.get_public_paths({
              project_id,
              cb(err, paths) {
                if (err) {
                  cb(err);
                } else {
                  public_paths = public_raw_paths_cache[project_id] = paths;
                  setTimeout(
                    () => delete public_raw_paths_cache[project_id],
                    3 * 60 * 1000
                  ); // cache a few seconds
                  cb();
                }
              },
            });
          }
        },
        function (cb) {
          //winston.debug("public_raw -- path_is_in_public_paths(#{path}, #{to_json(public_paths)})")
          if (!path_is_in_public_paths(path, public_paths)) {
            // The requested path is not public, so nothing to do.
            cb();
          } else {
            // The requested path *is* public, so we get the file
            // from one (of the potentially many) compute servers
            // that has the file -- (right now this is implemented
            // via sending/receiving JSON messages and using base64
            // encoding, but that could change).
            compute_server.project({
              project_id,
              cb(err, project) {
                if (err) {
                  cb(err);
                  return;
                }
                project.read_file({
                  path,
                  maxsize: 40000000, // 40MB for now
                  cb(err, data) {
                    if (err) {
                      cb(err);
                    } else {
                      if (query.download != null) {
                        res.setHeader("Content-disposition", "attachment");
                      }
                      const filename = path.slice(path.lastIndexOf("/") + 1);
                      // see https://www.npmjs.com/package/mime
                      const mime_type = getType(filename);
                      res.setHeader("Content-Type", mime_type);
                      const timeout = ms("10 minutes");
                      res.setHeader(
                        "Cache-Control",
                        `public, max-age='${timeout}'`
                      );
                      res.setHeader(
                        "Expires",
                        new Date(Date.now() + timeout).toUTCString()
                      );
                      res.write(data);
                      res.end();
                      is_public = true;
                      cb();
                    }
                  },
                });
              },
            });
          }
        },
      ],
      (err) => cb(err, is_public)
    );
  }
}
