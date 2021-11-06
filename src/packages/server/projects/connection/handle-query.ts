/*
Handle a project query (or query cancel) message from a project.
*/

import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import { error } from "@cocalc/util/message";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("project-connection:handle-query");

interface Options {
  project_id: string;
  mesg;
  sendResponse: (any) => void;
}

export default function handleQuery(opts: Options) {
  switch (opts.mesg.event) {
    case "query":
      query(opts);
      return;
    case "query_cancel":
      cancel(opts);
      return;
    default:
      throw Error(`unknown event ${opts.mesg.event}`);
  }
}

const changefeeds: { [project_id: string]: Set<string> } = {};

function query({ project_id, mesg, sendResponse }: Options) {
  logger.debug("query", project_id);
  const { id, changes, options, query } = mesg;
  if (!query) {
    throw Error("query must be defined");
  }
  let first = true; // relevant if changes is true
  if (changes) {
    if (changefeeds[project_id] === undefined) {
      changefeeds[project_id] = new Set<string>([id]);
    } else {
      changefeeds[project_id].add(id);
    }
  }
  const database = db();
  database.user_query({
    // use callback rather than async/await here, due to changefeed
    project_id,
    query,
    options,
    changes: changes ? id : undefined,
    cb: (err, result) => {
      if (result?.action == "close") {
        err = "close";
      }
      if (err) {
        logger.debug("query error", err);
        if (changefeeds[project_id]?.has(id)) {
          changefeeds[project_id]?.delete(id);
        }
        sendResponse(error({ error: `${err}` }));
        if (changes && !first) {
          database.user_query_cancel_changefeed({ id });
        }
      } else {
        let resp;
        if (changes && !first) {
          resp = result;
          resp.id = id;
          resp.multi_response = true;
        } else {
          first = false;
          resp = { ...mesg };
          resp.query = result;
        }
        sendResponse(resp);
      }
    },
  });
}

async function cancel({
  project_id,
  mesg,
  sendResponse,
}: Options): Promise<void> {
  const c = changefeeds[project_id];
  if (!c?.has(mesg.id)) {
    // no such changefeed -- nothing to do
    sendResponse(mesg);
    return;
  }
  const database = db();
  const resp = await callback2(database.user_query_cancel_changefeed, {
    id: mesg.id,
  });
  mesg.resp = resp;
  sendResponse(mesg);
  c.delete(mesg.id);
}

export async function cancelAll(project_id: string): Promise<void> {
  const database = db();
  const c = changefeeds[project_id];
  if (!c) return;
  for (const id of c) {
    try {
      await callback2(database.user_query_cancel_changefeed, { id });
      c.delete(id);
    } catch (err) {
      logger.debug("WARNING: error cancelling changefeed", id, err);
    }
  }
}
