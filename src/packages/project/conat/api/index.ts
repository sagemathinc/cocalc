/*

DEVELOPMENT:

How to do development (so in a dev project doing cc-in-cc dev).

0. From the browser, terminate this api server running in the project:

    await cc.client.conat_client.projectApi(cc.current()).system.terminate({service:'api'})

1. Create a file project-env.sh as explained in projects/conat/README.md, which defines these environment variables (your values will be different):

    export COCALC_PROJECT_ID="00847397-d6a8-4cb0-96a8-6ef64ac3e6cf"
    export COCALC_USERNAME=`echo $COCALC_PROJECT_ID | tr -d '-'`
    export HOME="/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/src/data/projects/$COCALC_PROJECT_ID"
    export DATA=$HOME/.smc

    # CRITICAL: make sure to create and set an api key!  Otherwise you will be blocked:
    export API_KEY=sk-OUwxAN8d0n7Ecd48000055
    export COMPUTE_SERVER_ID=0

    # optional for more logging
    export DEBUG=cocalc:*
    export DEBUG_CONSOLE=yes

If API_KEY is a project-wide API key, then you can change
COCALC_PROJECT_ID however you want and don't have to worry
about whether the project is running or the project secret
key changing when the project is restarted.

2. Then do this:

    $ . project-env.sh
    $ node
    ...
    > require("@cocalc/project/conat/api/index").init()

You can then easily be able to grab some state, e.g., by writing this in any cocalc code,
rebuilding and restarting:

    global.x = {...}

Remember, if you don't set API_KEY, then the project MUST be running so that the secret token in $HOME/.smc/secret_token is valid.

3. Use the browser to see the project is on the conat network and works:

    a = cc.client.conat_client.projectApi({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'});
    await a.system.ping();
    await a.system.exec({command:'echo $COCALC_PROJECT_ID'});

*/

import { type ProjectApi } from "@cocalc/conat/project/api";
import { getSubject } from "../names";
import { close as closeListings } from "@cocalc/project/conat/listings";
import { close as closeFilesRead } from "@cocalc/project/conat/files/read";
import { close as closeFilesWrite } from "@cocalc/project/conat/files/write";
import { close as closeJupyter } from "@cocalc/project/conat/jupyter";
import { getLogger } from "@cocalc/project/logger";
import { getIdentity } from "../connection";
import { initSshKey } from "@cocalc/project/ssh-keys";
const logger = getLogger("conat:api");

let terminate = false;
export async function init(opts?) {
  const { client, compute_server_id, project_id } = getIdentity(opts);
  logger.debug("serve: create project conat api service");
  const subject = getSubject({ service: "api", project_id, compute_server_id });
  // @ts-ignore
  const name = `project-${project_id}`;
  logger.debug(`serve: creating api service ${name}`);
  const api = await client.subscribe(subject);
  logger.debug(`serve: subscribed to subject='${subject}'`);

  // initialize project ssh keys
  initSshKey();
  listen(api, subject);
}

async function listen(api, subject) {
  for await (const mesg of api) {
    if (terminate) {
      return;
    }
    (async () => {
      try {
        await handleMessage(api, subject, mesg);
      } catch (err) {
        logger.debug(`WARNING: issue handling a message -- ${err}`);
      }
    })();
  }
}

async function handleMessage(api, subject, mesg) {
  const request = mesg.data ?? ({} as any);
  // logger.debug("got message", request);
  if (request.name == "system.terminate") {
    // TODO: should be part of handleApiRequest below, but done differently because
    // one case halts this loop
    const { service } = request.args[0] ?? {};
    if (service == "listings") {
      closeListings();
      await mesg.respond({ status: "terminated", service });
      return;
    } else if (service == "jupyter") {
      closeJupyter();
      await mesg.respond({ status: "terminated", service });
      return;
    } else if (service == "files:read") {
      await closeFilesRead();
      await mesg.respond({ status: "terminated", service });
      return;
    } else if (service == "files:write") {
      await closeFilesWrite();
      await mesg.respond({ status: "terminated", service });
      return;
    } else if (service == "api") {
      // special hook so admin can terminate handling. This is useful for development.
      terminate = true;
      console.warn("TERMINATING listening on ", subject);
      logger.debug("TERMINATING listening on ", subject);
      await mesg.respond({ status: "terminated", service });
      api.stop();
      return;
    } else {
      await mesg.respond({ error: `Unknown service ${service}` });
    }
  } else {
    await handleApiRequest(request, mesg);
  }
}

async function handleApiRequest(request, mesg) {
  let resp;
  const { name, args } = request as any;
  if (name == "ping") {
    resp = "pong";
  } else {
    try {
      // logger.debug("handling project.api request:", { name });
      resp = (await getResponse({ name, args })) ?? null;
    } catch (err) {
      logger.debug(`project.api request err = ${err}`, { name });
      resp = { error: `${err}` };
    }
  }
  await mesg.respond(resp);
}

import * as system from "./system";
import * as editor from "./editor";
import * as jupyter from "./jupyter";
import * as sync from "./sync";

export const projectApi: ProjectApi = {
  system,
  editor,
  jupyter,
  sync,
  isReady: async () => true,
  waitUntilReady: async () => {},
};

async function getResponse({ name, args }) {
  const [group, functionName] = name.split(".");
  const f = projectApi[group]?.[functionName];
  if (f == null) {
    throw Error(
      `unknown function '${name}' -- available functions are ${JSON.stringify(Object.keys(projectApi[group]))}`,
    );
  }
  return await f(...args);
}
