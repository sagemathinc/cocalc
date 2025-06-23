/*
To start this standalone

   s = await require('@cocalc/server/conat/socketio').initConatServer()
    
It will also get run integrated with the hub if the --conat-server option is passed in.

Using valkey

    s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000, valkey:'valkey://127.0.0.1:6379'})
    
or an example using an environment varaible and a password:

    CONAT_VALKEY=valkey://:test-password@127.0.0.1:6379 node
    ... 
    > s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000})
    
    
and in another session:

    s2 = await require('@cocalc/server/conat/socketio').initConatServer({port:3001, valkey:'valkey://127.0.0.1:6379'})
    
Then make a client connected to each:

    c1 = require('@cocalc/conat/core/client').connect('http://localhost:3000');
    c2 = require('@cocalc/conat/core/client').connect('http://localhost:3001');
    
*/

import {
  init as createConatServer,
  type Options,
} from "@cocalc/conat/core/server";
import { getUser, isAllowed } from "./auth";
import { secureRandomString } from "@cocalc/backend/misc";
import {
  conatValkey,
  conatSocketioCount,
  valkeyPassword,
  conatClusterPort,
} from "@cocalc/backend/data";
import basePath from "@cocalc/backend/base-path";
import port from "@cocalc/backend/port";
import { join } from "path";
import startCluster from "./start-cluster";
import { getLogger } from "@cocalc/backend/logger";
import "@cocalc/backend/conat";

const logger = getLogger("conat-server");

export async function init(options: Partial<Options> = {}) {
  logger.debug("init");
  console.log({ conatClusterPort, conatSocketioCount });

  if (conatClusterPort) {
    const mesg = `Conat cluster port is set so we spawn a cluster listening on port ${conatClusterPort}, instead of an in-process conat server`;
    console.log(mesg);
    logger.debug(mesg);
    startCluster();
    return;
  }

  let valkey: undefined | string | any = undefined;
  if (valkeyPassword) {
    // only hope is making valkey an object
    if (conatValkey) {
      if (conatValkey.startsWith("sentinel://")) {
        valkey = parseSentinelConfig(conatValkey, valkeyPassword);
      } else {
        valkey = parseValkeyConfigString(conatValkey, valkeyPassword);
      }
    }
  } else if (conatValkey) {
    valkey = conatValkey;
  }

  const opts = {
    getUser,
    isAllowed,
    systemAccountPassword: await secureRandomString(64),
    valkey,
    path: join(basePath, "conat"),
    port,
    ...options,
  };

  if (!conatSocketioCount || conatSocketioCount <= 1) {
    return createConatServer(opts);
  } else {
    // spawn conatSocketioCount subprocesses listening on random available ports
    // and all connected to valkey.   Proxy traffic to them.
    throw Error(`not implemented -- socket count = ${conatSocketioCount}`);
  }
}

export function parseValkeyConfigString(conatValkey: string, password: string) {
  const i = conatValkey.lastIndexOf("/");
  const x = conatValkey.slice(i + 1);
  const v = x.split(":");
  return {
    host: v[0] ?? "localhost",
    port: v[1] ? parseInt(v[1]) : 6379,
    password,
  };
}

// E.g., input:    sentinel://valkey-sentinel-0,valkey-sentinel-1,valkey-sentinel-2

export function parseSentinelConfig(conatValkey: string, password: string) {
  /*
  name: "cocalc",
  sentinelPassword: password,
  password,
  sentinels: [0, 1, 2].map((i) => ({
    host: `valkey-sentinel-${i}`,
    port: 26379,
  })),
  */
  const config = {
    name: "cocalc",
    sentinelPassword: password,
    password,
    sentinels: [] as { host: string; port: number }[],
  };
  for (const sentinel of conatValkey.split("sentinel://")[1].split(",")) {
    const [host, port = "26379"] = sentinel.split(":");
    config.sentinels.push({ host, port: parseInt(port) });
  }
  return config;
}
